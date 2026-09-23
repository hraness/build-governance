import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  CopyAssertionError,
  expectCountAgreement,
  expectInstallPinsMatch,
  expectNoInternalVocabulary,
  expectRealRunUrl,
} from "./expect.ts";

const pkg = { name: "@hraness/build-governance", version: "0.2.0" };

describe("expectInstallPinsMatch", () => {
  test("passes when every pin names the package version", () => {
    expect(() => expectInstallPinsMatch("bun add -d github:hraness/build-governance#v0.2.0", pkg)).not.toThrow();
  });

  test("fails on a stale pin and, by default, on a missing install line", () => {
    expect(() => expectInstallPinsMatch("bun add -d github:hraness/build-governance#v0.1.0", pkg)).toThrow(CopyAssertionError);
    expect(() => expectInstallPinsMatch("No install line.", pkg)).toThrow("found none");
    expect(() => expectInstallPinsMatch("No install line.", pkg, { require: false })).not.toThrow();
  });
});

describe("expectRealRunUrl", () => {
  test("accepts GitHub Actions run links with real IDs", () => {
    for (const url of [
      "https://github.com/hraness/wordcell/actions/runs/35482020560",
      "https://github.com/hraness/wordcell/actions/runs/35482020560/job/99",
      "https://github.com/hraness/wordcell/actions/runs/1234567890/attempts/2",
    ]) expect(() => expectRealRunUrl(url)).not.toThrow();
  });

  test("rejects placeholders, short IDs, and other hosts", () => {
    for (const url of [
      "https://github.com/hraness/wordcell/actions/runs/0",
      "https://github.com/hraness/wordcell/actions/runs/0000000000",
      "https://github.com/hraness/wordcell/actions/runs/123",
      "https://example.com/hraness/wordcell/actions/runs/35482020560",
      "https://github.com/hraness/wordcell/actions",
    ]) expect(() => expectRealRunUrl(url)).toThrow(CopyAssertionError);
  });

  test("accepts every ten-or-more digit ID that does not start with zero", () => {
    fc.assert(fc.property(fc.stringMatching(/^[1-9]\d{9,14}$/), id => {
      expect(() => expectRealRunUrl(`https://github.com/o/r/actions/runs/${id}`)).not.toThrow();
    }));
  });
});

describe("expectCountAgreement", () => {
  test("passes when one takes the singular and other counts the plural", () => {
    expect(() => expectCountAgreement(count => `${count} ${count === 1 ? "check" : "checks"} passed`)).not.toThrow();
    const words = ["zero", "one", "two", "three"];
    expect(() => expectCountAgreement(count => `${count === 0 ? "No" : words[count]} ${count === 1 ? "file" : "files"} changed`)).not.toThrow();
  });

  test("fails when the noun never changes", () => {
    expect(() => expectCountAgreement(count => `${count} checks passed`)).toThrow("same noun");
    expect(() => expectCountAgreement(count => `${count} check passed`)).toThrow("same noun");
  });

  test("fails when the count is missing or the plural forms disagree", () => {
    expect(() => expectCountAgreement(() => "Some checks passed")).toThrow("does not state the count");
    expect(() => expectCountAgreement(count => `${count} ${count === 0 ? "check" : count === 1 ? "check" : "checks"}`)).toThrow();
  });
});

describe("expectNoInternalVocabulary", () => {
  test("passes plain text and fails internal words on any surface", () => {
    expect(() => expectNoInternalVocabulary("Each task runs on one of your signed-in accounts.", "heading")).not.toThrow();
    expect(() => expectNoInternalVocabulary("Custody proven at settlement.", "body")).toThrow("Internal vocabulary");
    expect(() => expectNoInternalVocabulary("Open the habitat.", "body", { vocabulary: { add: ["habitat"] } })).toThrow();
  });
});
