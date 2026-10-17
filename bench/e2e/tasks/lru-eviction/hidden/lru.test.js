import test from "node:test";
import assert from "node:assert/strict";
import { LruCache } from "../src/lru.js";

test("a get refreshes recency so the other key is evicted", () => {
  const cache = new LruCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), 3);
});

test("replacing an existing key refreshes recency and does not grow the cache", () => {
  const cache = new LruCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 9);
  cache.set("c", 3);
  assert.equal(cache.get("a"), 9);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), 3);
});

test("capacity 1 keeps only the newest key", () => {
  const cache = new LruCache(1);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
});

test("a missing key stays missing", () => {
  const cache = new LruCache(2);
  cache.set("a", 1);
  assert.equal(cache.get("nope"), undefined);
  assert.equal(cache.get("a"), 1);
});

test("regression: a cold eviction still drops the oldest insertion", () => {
  const cache = new LruCache(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), 3);
});
