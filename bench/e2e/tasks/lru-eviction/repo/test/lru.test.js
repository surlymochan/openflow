import test from "node:test";
import assert from "node:assert/strict";
import { LruCache } from "../src/lru.js";

test("stores and returns a value", () => {
  const cache = new LruCache(2);
  cache.set("a", 1);
  assert.equal(cache.get("a"), 1);
});

test("evicts the oldest untouched insertion when the cache is cold", () => {
  const cache = new LruCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
});

test("rejects a capacity below 1", () => {
  assert.throws(() => new LruCache(0), /capacity/);
});
