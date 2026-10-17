import test from "node:test";
import assert from "node:assert/strict";
import { compareSemver } from "../src/semver.js";

test("minor and patch break ties", () => {
  assert.equal(compareSemver("1.2.0", "1.3.0"), -1);
  assert.equal(compareSemver("1.2.3", "1.2.4"), -1);
  assert.equal(compareSemver("1.4.0", "1.2.9"), 1);
});

test("a pre-release is less than the matching release", () => {
  assert.equal(compareSemver("1.0.0-alpha", "1.0.0"), -1);
  assert.equal(compareSemver("1.0.0", "1.0.0-alpha"), 1);
});

test("pre-release identifiers compare numerically, then lexically", () => {
  assert.equal(compareSemver("1.0.0-alpha", "1.0.0-alpha.1"), -1);
  assert.equal(compareSemver("1.0.0-alpha.1", "1.0.0-alpha.beta"), -1);
  assert.equal(compareSemver("1.0.0-alpha.2", "1.0.0-alpha.10"), -1);
});

test("build metadata does not affect order", () => {
  assert.equal(compareSemver("1.0.0+build.1", "1.0.0+build.2"), 0);
  assert.equal(compareSemver("1.0.0-alpha+001", "1.0.0-alpha"), 0);
});

test("regression: major ordering still holds", () => {
  assert.equal(compareSemver("1.0.0", "2.0.0"), -1);
});

test("invalid versions throw", () => {
  assert.throws(() => compareSemver("1.0", "1.0.0"), /invalid semver/);
  assert.throws(() => compareSemver("01.0.0", "1.0.0"), /invalid semver/);
});
