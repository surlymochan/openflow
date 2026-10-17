import { relative, resolve } from 'node:path';

export function relativizeText(text, repoRoot) {
  const root = resolve(repoRoot);
  const parent = resolve(root, '../..');
  const up = relative(root, parent) || '.';
  let out = String(text).split(`${root}/`).join('');
  out = out.split(root).join('.');
  out = out.split(`${parent}/`).join(`${up}/`);
  out = out.split(parent).join(up);
  out = out.replace(/\/tmp\/of-bench-[^/\s]+/g, '<fixture>');
  out = out.replace(/\/tmp\/[^/\s]+/g, '<tmp>');
  return out;
}

export function relativize(value, repoRoot) {
  if (typeof value === 'string') return relativizeText(value, repoRoot);
  if (Array.isArray(value)) return value.map((item) => relativize(item, repoRoot));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = relativize(item, repoRoot);
    return out;
  }
  return value;
}
