import test from "node:test";
import assert from "node:assert/strict";
import { paginate } from "../src/paginate.js";

test("rejects a page below 1", () => {
  assert.throws(() => paginate(["a"], 0, 1), /page/);
});

test("rejects a non-positive page size", () => {
  assert.throws(() => paginate(["a"], 1, 0), /pageSize/);
});

test("echoes total, page and pageSize for an even split", () => {
  const result = paginate(["a", "b", "c", "d"], 1, 2);
  assert.equal(result.total, 4);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 2);
  assert.equal(result.totalPages, 2);
});
