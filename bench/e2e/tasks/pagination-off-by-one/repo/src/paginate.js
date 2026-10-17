/**
 * 1-based page window over an array.
 * page and pageSize are integers >= 1.
 */
export function paginate(items, page, pageSize) {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error("page must be an integer >= 1");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("pageSize must be an integer >= 1");
  }
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = page * pageSize;
  const slice = items.slice(start, start + pageSize);
  return { items: slice, page, pageSize, total, totalPages };
}
