import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { checkInstallPins, compareVersions, findInstallPins, repositoryFor } from "./pins.ts";

const pkg = { name: "@hraness/build-governance", version: "0.2.0" };

describe("checkInstallPins", () => {
  test("flags npm specs, git tags, and release downloads older than package.json", () => {
    const text = [
      "bun add @hraness/build-governance@0.1.0",
      "bun add -d github:hraness/build-governance#v0.1.0",
      "npm i git+https://github.com/hraness/build-governance.git#v0.1.9",
      "curl -LO https://github.com/hraness/build-governance/releases/download/v0.1.0/pkg.tgz",
    ].join("\n");
    const findings = checkInstallPins([{ location: "README.md", text }], pkg);
    expect(findings.map(f => f.location)).toEqual(["README.md:1", "README.md:2", "README.md:3", "README.md:4"]);
    expect(findings.every(f => f.rule === "pins" && f.severity === "error")).toBe(true);
  });

  test("accepts current and newer pins and ignores other packages", () => {
    const text = "bun add github:hraness/build-governance#v0.2.0 @hraness/build-governance@0.3.0 @hraness/ui@0.0.1 github:hraness/build-governance-extra#v0.0.1";
    expect(checkInstallPins([{ location: "README.md", text }], pkg)).toEqual([]);
  });

  test("keeps selector locations and adds lines to file locations", () => {
    const findings = checkInstallPins([{ location: "site/index.html#p", text: "x\n@hraness/build-governance@0.0.1" }], pkg);
    expect(findings[0]?.location).toBe("site/index.html#p");
  });

  test("flags placeholder run IDs", () => {
    const findings = checkInstallPins([{ location: "README.md", text: "See /actions/runs/0 and /runs/000 but not /runs/1234567890." }], pkg);
    expect(findings.map(f => f.excerpt.includes("/runs/0"))).toEqual([true, true]);
  });

  test("uses the repository URL for packages outside the @hraness scope", () => {
    const other = { name: "soundfish", version: "1.0.0", repository: "git+https://github.com/hraness/soundfish.git" };
    expect(repositoryFor(other)).toBe("hraness/soundfish");
    expect(findInstallPins("npm i soundfish@0.9.0 and github:hraness/soundfish#v1.0.0", other).map(p => p.version)).toEqual(["0.9.0", "1.0.0"]);
    expect(checkInstallPins([{ location: "a", text: "npm i soundfish@0.9.0" }], other)).toHaveLength(1);
  });

  test("rejects a package version that is not semantic", () => {
    expect(() => checkInstallPins([], { name: "x", version: "latest" })).toThrow();
  });
});

describe("compareVersions", () => {
  const version = fc.tuple(fc.nat(30), fc.nat(30), fc.nat(30), fc.option(fc.constantFrom("alpha.1", "beta.2", "rc.1"), { nil: undefined }))
    .map(([a, b, c, pre]) => `${a}.${b}.${c}${pre ? `-${pre}` : ""}`);

  test("is antisymmetric and reflexive", () => {
    fc.assert(fc.property(version, version, (a, b) => {
      expect(Math.sign(compareVersions(a, b))).toBe(-Math.sign(compareVersions(b, a)) || 0);
      expect(compareVersions(a, a)).toBe(0);
    }));
  });

  test("orders a prerelease before its release and compares numerically", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
  });
});
