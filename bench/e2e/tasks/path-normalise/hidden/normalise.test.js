import test from "node:test";
import assert from "node:assert/strict";
import { normalise } from "../src/normalise.js";

test("parent segments collapse inside the path", () => {
  assert.equal(normalise("a/b/../c"), "a/c");
  assert.equal(normalise("a/b/c/../../d"), "a/d");
});

test("an absolute path does not climb above the root", () => {
  assert.equal(normalise("/a/../../b"), "/b");
  assert.equal(normalise("/../.."), "/");
});

test("a relative path may keep a leading parent", () => {
  assert.equal(normalise("a/../../b"), "../b");
  assert.equal(normalise("../a"), "../a");
});

test("a trailing slash is not a segment", () => {
  assert.equal(normalise("a/b/"), "a/b");
  assert.equal(normalise("/a/b/"), "/a/b");
});

test("regression: a dot segment is still dropped", () => {
  assert.equal(normalise("a/./b"), "a/b");
  assert.equal(normalise("."), ".");
});
