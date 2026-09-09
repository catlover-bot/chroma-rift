#!/usr/bin/env node
/* Verify every first-party source embedded in the actual Metro map. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const directory = process.argv[2], root = path.resolve(process.argv[3] || '.');
if (!directory) throw new Error('Usage: node scripts/inspect-bundle-sources.cjs <ios-js-export> [source-root]');
const files = fs.readdirSync(directory, { recursive: true });
const bundle = files.find(name => /\/ios\/.*\.js$/.test(name));
assert(bundle, 'An actual iOS JavaScript bundle and map are required');
const code = fs.readFileSync(path.join(directory, bundle));
const map = JSON.parse(fs.readFileSync(path.join(directory, bundle + '.map'), 'utf8'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const sources = map.sources.flatMap((name, i) => {
  const source = name.replaceAll('\\', '/');
  if (source.includes('node_modules/')) return [];
  const at = source.indexOf('src/');
  const relative = at >= 0 ? source.slice(at) : /(^|\/)(App|index)\.tsx?$/.test(source) ? source.split('/').pop() : undefined;
  if (!relative) return [];
  const current = fs.readFileSync(path.join(root, relative), 'utf8');
  const mapped = map.sourcesContent?.[i];
  return [{ source: relative, matches: current === mapped, currentSha256: sha(current),
    mappedSha256: typeof mapped === 'string' ? sha(mapped) : null }];
});
const result = { bundle, bundleSha256: sha(code), firstPartyCount: sources.length,
  scope: 'Every App/index/src source present in this emitted map; excluded external packages. Does not claim device execution or source absent from the bundle.',
  ok: sources.length > 100 && sources.every(source => source.matches), sources };
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
