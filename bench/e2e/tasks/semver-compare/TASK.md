# compareSemver only looks at the major number

`compareSemver(left, right)` in `src/semver.js` should return `-1`, `0` or `1`.

Compare major, then minor, then patch. A pre-release (`1.0.0-alpha`) is less than the same version without a pre-release. Pre-release identifiers are separated by dots. When both identifiers are numeric, compare them as numbers (`2` before `10`). Otherwise compare them as strings. A numeric identifier is less than a non-numeric one. If one pre-release list is a prefix of the other, the shorter one is less. Build metadata after `+` is ignored. An invalid version throws an error whose message includes `invalid semver`. Leading zeroes in a numeric core component are invalid.

Major ordering and exact equality already work. Visible tests (`node --test test/semver.test.js`) pass. Please finish the comparison.
