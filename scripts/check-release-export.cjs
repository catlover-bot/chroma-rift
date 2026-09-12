#!/usr/bin/env node
// Inspect the actual Metro export, rather than inferring its contents from
// __DEV__ guards in source. Run after an iOS or Android export with maps.
const fs = require('node:fs');
const path = require('node:path');

const [directory, platform = 'ios'] = process.argv.slice(2);
if (!directory || !['ios', 'android'].includes(platform)) {
  console.error('usage: node scripts/check-release-export.cjs <export-directory> [ios|android]');
  process.exit(2);
}
const fail = message => { throw new Error(message); };
const root = path.resolve(directory);
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8'));
const entry = metadata.fileMetadata?.[platform] ?? fail(`missing ${platform} export`);
const bundlePath = path.join(root, entry.bundle);
const mapPath = `${bundlePath}.map`;
const bundle = fs.readFileSync(bundlePath, 'utf8');
const sources = JSON.parse(fs.readFileSync(mapPath, 'utf8')).sources;
const forbidden = /(?:^|\/)(?:DeveloperLabScreen|StageSelectScreen|MicroMazeScreen|IllusionMazeScreen|JourneyResultScreen|FirstPersonResultScreen)\.[jt]sx?$|\/stage-kit-probe\//;
const included = sources.filter(source => forbidden.test(source));
if (included.length) fail(`development source packaged: ${included.join(', ')}`);
if (bundle.includes('stage-kit-probe')) fail('probe ID packaged in release bundle');
for (const id of ['perception-gallery-v1', 'uncanny-vault-v1', 'shadow-theatre-v1', 'mirror-corridor-v1', 'departure-control-v1']) {
  if (!bundle.includes(id)) fail(`campaign area missing from release bundle: ${id}`);
}
const assets = entry.assets ?? [];
if (!assets.some(asset => asset.ext === 'png') || !assets.some(asset => asset.ext === 'wav')) fail('visual or sound assets missing');
for (const asset of assets) if (!fs.statSync(path.join(root, asset.path)).isFile()) fail(`missing asset: ${asset.path}`);
console.log(`${platform} release export checked: ${sources.length} sources, ${assets.length} assets; 5 campaign areas present; development screens and probe absent`);
