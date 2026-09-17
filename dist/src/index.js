// @bun
// src/effect-architecture.ts
import { resolve, relative } from "path";
import ts from "typescript";
var effectPath = /[/\\]effect[/\\](?:dist[/\\]dts|src)[/\\]/;
var effectModule = /^(?:effect(?:\/|$)|@effect\/)/;
var runtimeFunctions = /^(?:run(?:Sync|SyncExit|Promise|PromiseExit|Fork|Callback)(?:With)?|forkDaemon|unsafeMake)$/;
var erasedFailures = new Set(["orDie", "orDieWith", "ignore", "ignoreLogged"]);
var nativeModules = /^(?:node:|bun$|fs(?:\/|$)|child_process$|worker_threads$|http$|https$|net$|tls$|dgram$)/;
var ambientCalls = new Set(["fetch", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"]);
function effectVariants(type) {
  if (type.isUnionOrIntersection())
    return type.types.flatMap(effectVariants);
  return type.getProperties().filter((symbol) => symbol.getName().startsWith("__@EffectTypeId@") && symbol.declarations?.some((d) => effectPath.test(d.getSourceFile().fileName)));
}
function inspectEffectArchitecture(program, policy) {
  const checker = program.getTypeChecker();
  const root = resolve(policy.root);
  const modules = new Set(policy.modules.map((f) => resolve(root, f)));
  const adapters = new Set(policy.adapters.map((f) => resolve(root, f)));
  const runtimeRoots = new Set(policy.runtimeRoots.map((f) => resolve(root, f)));
  const ignored = (policy.ignoredDirectories ?? []).map((f) => resolve(root, f));
  const findings = [];
  const sourceByPath = new Map(program.getSourceFiles().map((s) => [resolve(s.fileName), s]));
  for (const file of [...modules, ...adapters, ...runtimeRoots]) {
    if (!sourceByPath.has(file))
      findings.push({
        file: relative(root, file),
        line: 1,
        rule: "policy-source",
        message: "Declared architecture file is absent from this TypeScript program."
      });
  }
  for (const file of [...adapters, ...runtimeRoots]) {
    if (!modules.has(file))
      findings.push({
        file: relative(root, file),
        line: 1,
        rule: "policy-role",
        message: "An adapter/runtime root must also be a governed module."
      });
  }
  const report = (node, rule, message) => {
    const source = node.getSourceFile();
    findings.push({
      file: relative(root, source.fileName).replaceAll("\\", "/"),
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      rule,
      message
    });
  };
  const actualSymbol = (node) => {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias)
      symbol = checker.getAliasedSymbol(symbol);
    return symbol;
  };
  const externalEffectSymbol = (node, seen = new Set) => {
    while (ts.isParenthesizedExpression(node))
      node = node.expression;
    const symbol = ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) ? checker.getTypeAtLocation(node.expression).getProperty(node.argumentExpression.text) : actualSymbol(ts.isPropertyAccessExpression(node) ? node.name : node);
    if (!symbol || seen.has(symbol))
      return;
    seen.add(symbol);
    if (symbol.declarations?.some((d) => effectPath.test(d.getSourceFile().fileName)))
      return symbol;
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        const result = externalEffectSymbol(declaration.initializer, seen);
        if (result)
          return result;
      }
      if (ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent)) {
        const container = declaration.parent.parent;
        const property = declaration.propertyName ?? declaration.name;
        if (ts.isVariableDeclaration(container) && container.initializer && (ts.isIdentifier(property) || ts.isStringLiteral(property))) {
          const member = checker.getTypeAtLocation(container.initializer).getProperty(property.text);
          if (member?.declarations?.some((d) => effectPath.test(d.getSourceFile().fileName)))
            return member;
        }
      }
    }
    return;
  };
  const isAmbient = (node) => {
    const symbol = actualSymbol(node);
    return !!symbol?.declarations?.some((d) => d.getSourceFile().isDeclarationFile);
  };
  const platformDeclaration = (declaration) => {
    const source = declaration.getSourceFile();
    return program.isSourceFileDefaultLibrary(source) || program.isSourceFileFromExternalLibrary(source) && /[/\\](?:@types[/\\](?:node|bun)|bun-types)[/\\]/.test(source.fileName);
  };
  const nativeOrigins = new Map;
  const nativeCallbackDeclaration = (symbol) => {
    const cached = nativeOrigins.get(symbol);
    if (cached !== undefined)
      return cached;
    const result = symbol.declarations?.some((declaration) => {
      if (!platformDeclaration(declaration))
        return false;
      if (ambientCalls.has(symbol.getName()))
        return true;
      const parent = declaration.parent;
      return ts.isInterfaceDeclaration(parent) && (parent.name.text === "DateConstructor" && symbol.getName() === "now" || parent.name.text === "Math" && symbol.getName() === "random");
    }) ?? false;
    nativeOrigins.set(symbol, result);
    return result;
  };
  const constDeclaration = (declaration) => ts.isVariableDeclarationList(declaration.parent) && !!(declaration.parent.flags & ts.NodeFlags.Const);
  const nativeNamespaceNames = ["Date", "Math", "globalThis", "window", "self", "global"];
  const nativeNamespaces = new Set(nativeNamespaceNames.flatMap((name) => {
    const symbol = checker.resolveName(name, undefined, ts.SymbolFlags.Value, false);
    return symbol && (name === "globalThis" || symbol.declarations?.some(platformDeclaration)) ? [symbol] : [];
  }));
  const unwrapValue = (node) => {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node))
      node = node.expression;
    return node;
  };
  const memberSymbol = (node) => ts.isPropertyAccessExpression(node) ? actualSymbol(node.name) : ts.isStringLiteral(node.argumentExpression) ? checker.getTypeAtLocation(node.expression).getProperty(node.argumentExpression.text) : undefined;
  const nativeNamespaceSymbol = (symbol, seen) => {
    if (!symbol)
      return false;
    if (symbol.flags & ts.SymbolFlags.Alias)
      symbol = checker.getAliasedSymbol(symbol);
    if (seen.has(symbol))
      return false;
    seen.add(symbol);
    if (nativeNamespaces.has(symbol))
      return true;
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && constDeclaration(declaration) && declaration.initializer && nativeNamespace(declaration.initializer, seen))
        return true;
      if (ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent)) {
        const container = declaration.parent.parent;
        const property = declaration.propertyName ?? declaration.name;
        if (ts.isVariableDeclaration(container) && constDeclaration(container) && container.initializer && (ts.isIdentifier(property) || ts.isStringLiteral(property)) && nativeNamespace(container.initializer, new Set(seen)) && nativeNamespaceSymbol(checker.getTypeAtLocation(container.initializer).getProperty(property.text), seen))
          return true;
      }
    }
    return false;
  };
  const nativeNamespace = (expression, seen = new Set) => {
    const node = unwrapValue(expression);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      return nativeNamespace(node.expression, new Set(seen)) && nativeNamespaceSymbol(memberSymbol(node), seen);
    }
    return ts.isIdentifier(node) && nativeNamespaceSymbol(actualSymbol(node), seen);
  };
  const nativeCallbackSymbol = (symbol, seen) => {
    if (!symbol)
      return false;
    if (symbol.flags & ts.SymbolFlags.Alias)
      symbol = checker.getAliasedSymbol(symbol);
    if (seen.has(symbol))
      return false;
    seen.add(symbol);
    if (nativeCallbackDeclaration(symbol))
      return true;
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && constDeclaration(declaration) && declaration.initializer && nativeCallback(declaration.initializer, seen))
        return true;
      if (ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent)) {
        const container = declaration.parent.parent;
        const property = declaration.propertyName ?? declaration.name;
        if (ts.isVariableDeclaration(container) && constDeclaration(container) && container.initializer && (ts.isIdentifier(property) || ts.isStringLiteral(property))) {
          const member = checker.getTypeAtLocation(container.initializer).getProperty(property.text);
          if (member && (!nativeCallbackDeclaration(member) || nativeNamespace(container.initializer)) && nativeCallbackSymbol(member, seen))
            return true;
        }
      }
    }
    return false;
  };
  const nativeCallback = (expression, seen = new Set) => {
    const node = unwrapValue(expression);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const member = memberSymbol(node);
      return !!member && (!nativeCallbackDeclaration(member) || nativeNamespace(node.expression)) && nativeCallbackSymbol(member, seen);
    }
    const symbol = ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : actualSymbol(node);
    return nativeCallbackSymbol(symbol, seen);
  };
  const runtimeValuePosition = (node) => {
    for (let parent2 = node.parent;parent2; parent2 = parent2.parent) {
      if (ts.isTypeNode(parent2) || ts.isImportDeclaration(parent2) || ts.isExportDeclaration(parent2) && parent2.isTypeOnly || ts.isExportSpecifier(parent2) && parent2.isTypeOnly)
        return false;
    }
    const parent = node.parent;
    if (!parent)
      return false;
    if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent) || ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node)
      return false;
    if (ts.isBindingElement(parent) && parent.propertyName === node)
      return false;
    return !(ts.isPropertyAccessExpression(parent) && parent.name === node);
  };
  const isEffect = (node) => effectVariants(checker.getTypeAtLocation(node)).length > 0;
  const effectValueTypes = new Map;
  const effectValueType = (type) => {
    const cached = effectValueTypes.get(type);
    if (cached !== undefined)
      return cached;
    const result = effectVariants(type).length > 0 || type.getCallSignatures().some((signature) => effectVariants(checker.getReturnTypeOfSignature(signature)).length > 0);
    effectValueTypes.set(type, result);
    return result;
  };
  const effectValueSymbols = new Map;
  const effectValueSymbol = (symbol, at) => {
    if (!symbol)
      return false;
    if (symbol.declarations?.some((declaration) => ts.isExportSpecifier(declaration) && (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly)))
      return false;
    if (symbol.flags & ts.SymbolFlags.Alias)
      symbol = checker.getAliasedSymbol(symbol);
    const cached = effectValueSymbols.get(symbol);
    if (cached !== undefined)
      return cached;
    const result = !!(symbol.flags & ts.SymbolFlags.Value) && effectValueType(checker.getTypeOfSymbolAtLocation(symbol, at));
    effectValueSymbols.set(symbol, result);
    return result;
  };
  const containsEffectValue = (node) => {
    if (ts.isTypeNode(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeParameterDeclaration(node))
      return false;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (!clause || clause.isTypeOnly)
        return false;
      if (clause.name && effectValueSymbol(checker.getSymbolAtLocation(clause.name), clause.name))
        return true;
      const bindings = clause.namedBindings;
      return !!bindings && ts.isNamedImports(bindings) && bindings.elements.some((element) => !element.isTypeOnly && effectValueSymbol(checker.getSymbolAtLocation(element.name), element));
    }
    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly)
        return false;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        return node.exportClause.elements.some((element) => !element.isTypeOnly && effectValueSymbol(checker.getSymbolAtLocation(element.name), element));
      }
      if (!node.exportClause && node.moduleSpecifier) {
        const moduleSymbol = checker.getSymbolAtLocation(node.moduleSpecifier);
        return !!moduleSymbol && checker.getExportsOfModule(moduleSymbol).some((symbol) => effectValueSymbol(symbol, node));
      }
      return false;
    }
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) || (ts.isIdentifier(node) || ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && runtimeValuePosition(node)) && effectValueType(checker.getTypeAtLocation(node)))
      return true;
    return ts.forEachChild(node, containsEffectValue) ?? false;
  };
  const canFail = (node) => effectVariants(checker.getTypeAtLocation(node)).some((variance) => {
    const fields = checker.getTypeOfSymbolAtLocation(variance, node);
    const error = fields.getProperty("_E");
    const signature = error && checker.getTypeOfSymbolAtLocation(error, node).getCallSignatures()[0];
    return signature !== undefined && !(checker.getReturnTypeOfSignature(signature).flags & ts.TypeFlags.Never);
  });
  const containsFallibleYield = (node) => {
    if (ts.isFunctionLike(node))
      return false;
    if (ts.isYieldExpression(node) && node.expression && canFail(node.expression))
      return true;
    return ts.forEachChild(node, containsFallibleYield) ?? false;
  };
  const generatorFunctions = new Set;
  const resolveGenerator = (expression, seen = new Set) => {
    while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isSatisfiesExpression(expression))
      expression = expression.expression;
    if (ts.isFunctionExpression(expression) && expression.asteriskToken) {
      generatorFunctions.add(expression);
      return;
    }
    const symbol = actualSymbol(ts.isPropertyAccessExpression(expression) ? expression.name : expression);
    if (!symbol || seen.has(symbol))
      return;
    seen.add(symbol);
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isFunctionDeclaration(declaration) && declaration.asteriskToken && declaration.body) {
        generatorFunctions.add(declaration);
      } else if (ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isVariableDeclarationList(declaration.parent) && declaration.parent.flags & ts.NodeFlags.Const) {
        resolveGenerator(declaration.initializer, seen);
      }
    }
  };
  const collectGenerators = (node) => {
    if (ts.isCallExpression(node) && externalEffectSymbol(node.expression)?.getName() === "gen") {
      for (const argument of node.arguments)
        resolveGenerator(argument);
    }
    ts.forEachChild(node, collectGenerators);
  };
  for (const source of program.getSourceFiles()) {
    if (!source.isDeclarationFile && !program.isSourceFileFromExternalLibrary(source))
      collectGenerators(source);
  }
  const insideEffectGenerator = (node) => {
    for (let parent = node.parent;parent; parent = parent.parent) {
      if (!ts.isFunctionLike(parent))
        continue;
      return generatorFunctions.has(parent);
    }
    return false;
  };
  const checkChannels = (node) => {
    const type = checker.getTypeAtLocation(node);
    for (const variance of effectVariants(type)) {
      const fields = checker.getTypeOfSymbolAtLocation(variance, node);
      for (const channel of ["_E", "_R"]) {
        const field = fields.getProperty(channel);
        if (!field)
          continue;
        const signature = checker.getTypeOfSymbolAtLocation(field, node).getCallSignatures()[0];
        if (!signature)
          continue;
        const value = checker.getReturnTypeOfSignature(signature);
        if (value.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
          report(node, "explicit-channel", `${channel === "_E" ? "Error" : "Requirement"} channel must not be any/unknown.`);
        }
      }
    }
  };
  for (const source of program.getSourceFiles()) {
    const file = resolve(source.fileName);
    if (source.isDeclarationFile || program.isSourceFileFromExternalLibrary(source))
      continue;
    const local = relative(root, file).replaceAll("\\", "/");
    if (local.startsWith("../") || /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?tsx?$/.test(local))
      continue;
    if (ignored.some((dir) => file === dir || file.startsWith(dir + "/")))
      continue;
    const findEffectImports = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && effectModule.test(node.moduleSpecifier.text))
        return true;
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require" && isAmbient(node.expression))) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument) && effectModule.test(argument.text))
          return true;
      }
      return ts.forEachChild(node, findEffectImports) ?? false;
    };
    const importsEffect = findEffectImports(source);
    if (!modules.has(file)) {
      if (importsEffect || containsEffectValue(source))
        report(source, "unclassified-module", "Production Effect import/export or value needs an explicit reviewed architecture role.");
      continue;
    }
    const adapter = adapters.has(file);
    const runtimeRoot = runtimeRoots.has(file);
    const references = new Map;
    const countReferences = (node) => {
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        const declarationName = ts.isVariableDeclaration(parent) && parent.name === node;
        const assigned = ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        const symbol = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
        if (symbol && !declarationName && !assigned)
          references.set(symbol, (references.get(symbol) ?? 0) + 1);
      }
      ts.forEachChild(node, countReferences);
    };
    countReferences(source);
    const suppression = /@ts-(?:ignore|nocheck|expect-error)|@effect-diagnostics[^\n]*(?:off|disable)/g;
    for (const match of source.text.matchAll(suppression)) {
      findings.push({
        file: local,
        line: source.getLineAndCharacterOfPosition(match.index).line + 1,
        rule: "suppression",
        message: "Architecture/typing suppression requires removal or an explicit owner-reviewed policy change."
      });
    }
    const visit = (node) => {
      if (ts.isTryStatement(node) && node.catchClause && insideEffectGenerator(node) && containsFallibleYield(node.tryBlock)) {
        report(node.catchClause, "javascript-effect-catch", "JavaScript catch does not handle typed Effect failures; use catchTag, catchAll or Exit.");
      }
      if (ts.isExpressionStatement(node)) {
        let expression = node.expression;
        while (ts.isParenthesizedExpression(expression) || ts.isVoidExpression(expression))
          expression = expression.expression;
        const assignedSymbol = ts.isBinaryExpression(expression) && ts.isIdentifier(expression.left) ? checker.getSymbolAtLocation(expression.left) : undefined;
        const storesValue = ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && (!ts.isIdentifier(expression.left) || assignedSymbol !== undefined && (references.get(assignedSymbol) ?? 0) > 0);
        if (isEffect(expression) && !storesValue)
          report(expression, "floating-effect", "Effect work must be composed, returned or executed by its owner.");
      }
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
        if (isEffect(node) || isEffect(node.expression))
          report(node, "effect-assertion", "Do not assert Effect success/error/requirement channels; provide and handle them.");
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isEffect(node.initializer)) {
        const symbol = checker.getSymbolAtLocation(node.name);
        const statement = node.parent.parent;
        const exported = ts.isVariableStatement(statement) && statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!exported && symbol && (references.get(symbol) ?? 0) === 0) {
          report(node, "unused-effect", "An assigned Effect is never consumed or exported.");
        }
      }
      if (node.kind === ts.SyntaxKind.AnyKeyword)
        report(node, "explicit-any", "Explicit any is not allowed in governed Effect modules.");
      if (ts.isTypeReferenceNode(node) || ts.isVariableDeclaration(node) || ts.isPropertySignature(node))
        checkChannels(node);
      if (!adapter && ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && nativeModules.test(node.moduleSpecifier.text)) {
        report(node, "native-import", "Native I/O imports belong in an adapter.");
      }
      if (ts.isCallExpression(node)) {
        if (!adapter && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require" && isAmbient(node.expression))) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteral(argument) && nativeModules.test(argument.text)) {
            report(node, "native-import", "Native I/O imports belong in an adapter.");
          }
        }
        const symbol = externalEffectSymbol(node.expression);
        const constructsRuntime = symbol?.getName() === "make" && symbol.declarations?.some((d) => /[/\\](?:ManagedRuntime|Runtime)\.(?:d\.)?ts$/.test(d.getSourceFile().fileName));
        if (symbol && (runtimeFunctions.test(symbol.getName()) || constructsRuntime) && !runtimeRoot) {
          report(node, "runtime-owner", `${symbol.getName()} belongs in a declared runtime owner.`);
        }
        if (symbol && erasedFailures.has(symbol.getName())) {
          report(node, "erased-failure", "Handle expected failures explicitly; do not erase them or turn them into defects.");
        }
      }
      if (!adapter && runtimeValuePosition(node) && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && nativeCallback(node)) {
        report(node, "ambient-io", "Use a declared service for ambient I/O and time.");
      }
      if (!adapter && ts.isBindingElement(node) && ts.isIdentifier(node.name) && nativeCallback(node.name)) {
        report(node, "ambient-io", "Use a declared service for ambient I/O and time.");
      }
      if (!adapter && ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ["Promise", "Date", "Worker", "AbortController"].includes(node.expression.text) && isAmbient(node.expression)) {
        report(node, "native-constructor", "Foreign asynchronous resources belong in an adapter.");
      }
      if (!adapter && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "process" && node.name.text === "env" && isAmbient(node.expression)) {
        report(node, "ambient-config", "Configuration belongs in an injected service.");
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const unique = new Map(findings.map((f) => [`${f.file}:${f.line}:${f.rule}:${f.message}`, f]));
  return [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
}
function createArchitectureProgram(configFile) {
  const config = ts.readConfigFile(configFile, (file) => ts.sys.readFile(file));
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, `
`));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(configFile, ".."));
  if (parsed.errors.length)
    throw new Error(parsed.errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, `
`)).join(`
`));
  return ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
}

// src/portfolio-inventory.ts
import { readFile } from "fs/promises";
import { resolve as resolve2 } from "path";
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}
function stringField(value, key) {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`package.json ${key} must be a non-empty string`);
  }
  return field;
}
function repositorySlug(value) {
  const repository = record(value, "package.json repository");
  const url = stringField(repository, "url");
  const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url);
  if (match?.[1] === undefined) {
    throw new Error("package.json repository.url must identify a GitHub repository");
  }
  return match[1];
}
function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function hranessSourceRepository(specifier) {
  const commitMatch = /^git\+https:\/\/github\.com\/(hraness\/[A-Za-z0-9._-]+)\.git#[0-9a-f]{40}$/u.exec(specifier);
  if (commitMatch?.[1] !== undefined)
    return commitMatch[1];
  const stableTagMatch = /^github:(hraness\/[A-Za-z0-9._-]+)#v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u.exec(specifier);
  const releaseMatch = /^https:\/\/github\.com\/(hraness\/[A-Za-z0-9._-]+)\/releases\/download\/v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.tgz$/u.exec(specifier);
  const sourceRepository = stableTagMatch?.[1] ?? releaseMatch?.[1];
  return sourceRepository?.endsWith(".git") === true ? undefined : sourceRepository;
}
function canonicalPortfolioInventory(value) {
  const packageManifest = record(value, "package.json");
  const packageName = stringField(packageManifest, "name");
  const version = stringField(packageManifest, "version");
  const repository = repositorySlug(packageManifest.repository);
  const dependencySections = [
    ["devDependencies", "development"],
    ["optionalDependencies", "optional"],
    ["peerDependencies", "peer"],
    ["dependencies", "runtime"]
  ];
  const dependencies = dependencySections.flatMap(([section, scope]) => {
    const dependencySection = packageManifest[section];
    if (dependencySection === undefined)
      return [];
    const entries = record(dependencySection, `package.json ${section}`);
    return Object.entries(entries).flatMap(([name, rawSpecifier]) => {
      if (typeof rawSpecifier !== "string" || rawSpecifier.length === 0) {
        throw new Error(`package.json ${section}.${name} must be a non-empty string`);
      }
      const sourceRepository = hranessSourceRepository(rawSpecifier);
      if (!name.startsWith("@hraness/") && sourceRepository === undefined)
        return [];
      return [{
        from: packageName,
        scope,
        specifier: rawSpecifier,
        to: name,
        ...sourceRepository === undefined ? {} : { sourceRepository }
      }];
    });
  }).toSorted((left, right) => asciiCompare(left.from, right.from) || asciiCompare(left.to, right.to) || asciiCompare(left.scope, right.scope) || asciiCompare(left.specifier, right.specifier) || asciiCompare(left.sourceRepository ?? "", right.sourceRepository ?? ""));
  return {
    contract: "hraness.portfolio-inventory/v1",
    formatVersion: 1,
    repository,
    components: [{
      kind: "package",
      name: packageName,
      path: ".",
      visibility: "public",
      version
    }],
    dependencies,
    deployments: [],
    brands: [],
    publications: [{
      component: packageName,
      packageName,
      repository
    }]
  };
}
function canonicalPortfolioInventoryBytes(value) {
  return `${JSON.stringify(canonicalPortfolioInventory(value), null, 2)}
`;
}
var repositoryRoot = resolve2(import.meta.dir, "..");
if (import.meta.main) {
  const packageManifest = JSON.parse(await readFile(resolve2(repositoryRoot, "package.json"), "utf8"));
  const expectedBytes = canonicalPortfolioInventoryBytes(packageManifest);
  const actualBytes = await readFile(resolve2(repositoryRoot, "portfolio-inventory.json"), "utf8");
  if (actualBytes !== expectedBytes) {
    throw new Error("portfolio-inventory.json does not match the canonical package inventory");
  }
}
export {
  inspectEffectArchitecture,
  hranessSourceRepository,
  createArchitectureProgram,
  canonicalPortfolioInventoryBytes,
  canonicalPortfolioInventory
};
