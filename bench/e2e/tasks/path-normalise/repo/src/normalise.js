/** Collapse redundant segments in a POSIX-style path. */
export function normalise(input) {
  if (typeof input !== "string") {
    throw new TypeError("path must be a string");
  }
  const absolute = input.startsWith("/");
  const parts = input.split("/");
  const out = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    out.push(part);
  }
  if (absolute) return "/" + out.join("/");
  return out.join("/") || ".";
}
