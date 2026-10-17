import test from "node:test";
import assert from "node:assert/strict";
import { compareSemver } from "../src/semver.js";

test("equal versions compare equal", () => {
  assert.equal(compareSemver("1.2.3", "1.2.3"), 0);
});

test("a lower major version sorts first", () => {
  assert.equal(compareSemver("1.0.0", "2.0.0"), -1);
  assert.equal(compareSemver("3.0.0", "1.9.9"), 1);
});
