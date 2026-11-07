/**
 * Programmatic entry point for @surlymochan/evalid.
 *
 * This is the file package.json "main" points to. It used to not exist at
 * all, so `import '@surlymochan/evalid'` / `require('@surlymochan/evalid')`
 * failed with MODULE_NOT_FOUND even though the published tarball shipped
 * "main": "src/index.js". The package is CLI-first (bin: xflow), but the
 * control-plane server is the one documented programmatic surface, so this
 * module re-exports its starter. Importing this module has no side effects:
 * it does not start a server.
 */
export { default, default as startServer } from './server.js';
