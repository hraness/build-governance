// @bun
// src/portfolio-inventory.ts
import { readFile } from "fs/promises";
import { resolve } from "path";
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
var repositoryRoot = resolve(import.meta.dir, "..");
if (import.meta.main) {
  const packageManifest = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
  const expectedBytes = canonicalPortfolioInventoryBytes(packageManifest);
  const actualBytes = await readFile(resolve(repositoryRoot, "portfolio-inventory.json"), "utf8");
  if (actualBytes !== expectedBytes) {
    throw new Error("portfolio-inventory.json does not match the canonical package inventory");
  }
}
export {
  hranessSourceRepository,
  canonicalPortfolioInventoryBytes,
  canonicalPortfolioInventory
};
