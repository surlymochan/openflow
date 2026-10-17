# normalise leaves parent segments in place

`normalise` in `src/normalise.js` cleans a POSIX-style path string.

- Drop `.` segments.
- `..` pops the previous real segment.
- An absolute path (one that starts with `/`) never climbs above the root. Extra `..` at the root are discarded, and the result stays absolute (`/` when nothing remains).
- A relative path may start with `..` when it would leave the relative root. `a/../../b` is `../b`.
- Empty segments from a trailing or doubled slash are not kept.
- `.` alone is `.`. A non-string throws `TypeError`.

Dot segments already collapse, and the visible tests (`node --test test/normalise.test.js`) pass. Parent segments do not. Please finish the normalisation.
