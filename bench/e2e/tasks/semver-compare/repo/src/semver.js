/**
 * Compare two semantic versions.
 * Returns -1, 0 or 1.
 */
const CORE = /^(\d+)\.(\d+)\.(\d+)$/;

function parse(value) {
  const match = CORE.exec(value);
  if (!match) throw new Error("invalid semver");
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareSemver(left, right) {
  const a = parse(left);
  const b = parse(right);
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  return 0;
}
