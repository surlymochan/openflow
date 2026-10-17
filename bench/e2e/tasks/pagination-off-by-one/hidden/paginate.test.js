import test from "node:test";
import assert from "node:assert/strict";
import { paginate } from "../src/paginate.js";

test("page 1 is the first window, not the second", () => {
  const result = paginate(["a", "b", "c", "d", "e"], 1, 2);
  assert.deepEqual(result.items, ["a", "b"]);
  assert.equal(result.totalPages, 3);
  assert.equal(result.total, 5);
});

test("the last page keeps a short remainder", () => {
  const result = paginate(["a", "b", "c", "d", "e"], 3, 2);
  assert.deepEqual(result.items, ["e"]);
  assert.equal(result.page, 3);
});

test("page 2 starts immediately after page 1", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g"];
  assert.deepEqual(paginate(items, 2, 3).items, ["d", "e", "f"]);
});

test("a page past the end is an empty window and totalPages still covers every item", () => {
  const result = paginate(["a", "b", "c"], 4, 2);
  assert.deepEqual(result.items, []);
  assert.equal(result.totalPages, 2);
});

test("regression: page 0 still throws", () => {
  assert.throws(() => paginate(["a", "b"], 0, 2), /page/);
});
