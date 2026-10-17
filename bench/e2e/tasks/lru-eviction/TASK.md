# LRU cache forgets which key was used

`LruCache` in `src/lru.js` is a map with a fixed capacity. When a `set` would exceed the capacity, the least recently used key is dropped.

Both `get` and `set` of an existing key count as a use and should make that key the newest one. Updating a key that is already present must not grow the cache. `get` of a missing key returns `undefined` and does not change order. Capacity is an integer greater than or equal to 1.

Right now a read does not protect a key. After filling the cache, reading one entry and inserting another still evicts the entry that was just read. Visible tests (`node --test test/lru.test.js`) pass. Please fix eviction so it follows use, not only insertion.
