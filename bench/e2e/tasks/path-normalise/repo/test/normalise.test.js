import test from "node:test";
import assert from "node:assert/strict";
import { normalise } from "../src/normalise.js";

test("drops a dot segment", () => {
  assert.equal(normalise("a/./b"), "a/b");
});

test("keeps an absolute path absolute", () => {
  assert.equal(normalise("/a/b"), "/a/b");
});

test("a lone dot is the current directory", () => {
  assert.equal(normalise("."), ".");
});

test("rejects a non-string", () => {
  assert.throws(() => normalise(12), TypeError);
});
