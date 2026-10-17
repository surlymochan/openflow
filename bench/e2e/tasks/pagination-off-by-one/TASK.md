# Page windows start one page too late

`paginate(items, page, pageSize)` in `src/paginate.js` returns a 1-based slice of an array:

`{ items, page, pageSize, total, totalPages }`

Callers report that asking for page 1 skips the first window and returns the second one instead. The rest of the contract is:

- `page` and `pageSize` are integers greater than or equal to 1. Anything else throws.
- Page 1 is the first `pageSize` items. Page 2 is the next window, with no gap and no overlap.
- The last page may be shorter than `pageSize`.
- `total` is the full input length.
- `totalPages` is how many windows are needed to cover every item, and 0 when the input is empty.
- A page past the end returns an empty `items` array. `totalPages` does not change.

Visible tests (`node --test test/paginate.test.js`) already pass. Please fix the implementation without changing the return shape.
