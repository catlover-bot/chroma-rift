#!/usr/bin/env node
'use strict';
/* global __dirname */
// Release-scoped audit: compare the candidate with an explicit Git baseline.
// This does not reserve a store name or inspect a signed production binary.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--(baseline|introspection|out)=(.+)$/.exec(arg);
  if (!match) throw Error('Usage: node scripts/validate-release-identity.cjs --introspection=file [--baseline=commit] [--out=file]');
  return [match[1], match[2]];
}));
assert(args.introspection, 'Supply actual Expo config --type introspect output');
const baseline = args.baseline ?? '0563e2d4bb76280fba2643078aa619e166bf8009';
assert(/^[a-f0-9]{40}$/.test(baseline), 'Baseline must be a full local commit hash');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));
const prior = file => cp.execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
const app = JSON.parse(read('app.json')), oldApp = JSON.parse(prior('app.json'));
const eas = JSON.parse(read('eas.json'));
const allowedAppPaths = ['expo.name', 'expo.ios.infoPlist.CFBundleDevelopmentRegion', 'expo.ios.infoPlist.CFBundleLocalizations'];
function differences(before, after, prefix = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return [prefix];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => differences(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}
const appDiff = differences(oldApp, app);
assert.deepEqual([...appDiff].sort(), [...allowedAppPaths].sort(), 'Only the display name and Japanese language declarations may change');
assert.equal(app.expo.name, '錯視館');
assert.equal(app.expo.ios.infoPlist.CFBundleDevelopmentRegion, 'ja');
assert.deepEqual(app.expo.ios.infoPlist.CFBundleLocalizations, ['ja']);
const protectedFiles = ['package.json', 'package-lock.json', 'eas.json', 'metro.config.js', 'metro/withNativeThree.js'];
const protectedHashes = Object.fromEntries(protectedFiles.map(file => {
  const before = sha(prior(file)), after = sha(read(file));
  assert.equal(after, before, `${file} changed without an approved release-setting exception`);
  return [file, { before, after }];
}));
assert.equal(eas.cli.appVersionSource, 'remote');
assert.equal(eas.build.production.developmentClient, false);
assert.equal(eas.build.production.autoIncrement, true);
assert.notEqual(eas.build.production.distribution, 'internal');
assert.notEqual(eas.build.production.ios?.simulator, true);
assert.equal(eas.build.production.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE, 'production');
assert.equal(eas.submit, undefined, 'No confirmed ascAppId exists for this candidate; do not add a dummy');
const tracked = cp.execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const stableRuntime = tracked.filter(file => /^(src\/storage\/|src\/domain\/campaign\/|src\/domain\/stages\/|src\/domain\/stageKit\/)/.test(file) && !/(__tests__|\.test\.)/.test(file));
const runtimeHashes = Object.fromEntries(stableRuntime.map(file => {
  const before = sha(prior(file)), after = sha(read(file));
  assert.equal(after, before, `Rename must not change stage/campaign/save implementation: ${file}`);
  return [file, after];
}));
const oldNameAllowlist = [
  { pattern: /^src\/storage\//, reason: 'Existing persistence keys' },
  { pattern: /^src\/domain\/stageKit\/definitions\.ts$/, reason: 'Registered stage save keys' },
  { pattern: /^src\/rendering\/firstPerson\/planarMirror\.ts$/, reason: 'Internal Three material names' },
  { pattern: /^src\/rendering\/firstPerson\/canvasLifecycle\.ts$/, reason: '__DEV__ console diagnostic prefix' },
  { pattern: /(__tests__|\.test\.)/, reason: 'Technical identifier fixtures and explicit rename assertions' },
];
const retainedOldNames = [];
for (const file of tracked.filter(file => /^(src\/|App\.tsx$)/.test(file) && /\.[jt]sx?$/.test(file))) {
  if (!/chroma[ _-]?rift/i.test(read(file).toString())) continue;
  const allowed = oldNameAllowlist.find(entry => entry.pattern.test(file));
  assert(allowed, `Old product name remains outside the explicit technical/fixture allowlist: ${file}`);
  retainedOldNames.push({ file, reason: allowed.reason });
}
const introspectionBytes = fs.readFileSync(path.resolve(args.introspection));
const config = JSON.parse(introspectionBytes);
const plist = config._internal?.modResults?.ios?.infoPlist;
assert(plist, 'Actual iOS Info.plist mod output is required');
assert.equal(config.name, app.expo.name);
assert.equal(config.ios.bundleIdentifier, app.expo.ios.bundleIdentifier);
assert.equal(plist.CFBundleDisplayName, app.expo.name);
assert.equal(plist.CFBundleDevelopmentRegion, 'ja');
assert.deepEqual(plist.CFBundleLocalizations, ['ja']);
assert.equal(plist.NSMicrophoneUsageDescription, undefined);
assert.equal(plist.UIBackgroundModes, undefined);
assert.deepEqual(config.extra.eas, app.expo.extra.eas);
const report = {
  ok: true, baseline, appDiff, allowedAppPaths, protectedHashes, runtimeHashes, retainedOldNames,
  historicalAndLicenseExclusions: ['docs/qa-* and prior Goal reports preserve their original evidence', 'assets/perceptual/manifest.json retains its original author credit', 'package/slug/scheme/bundle/project IDs are technical identity'],
  identity: { name: app.expo.name, version: app.expo.version, slug: app.expo.slug, scheme: app.expo.scheme, bundleIdentifier: app.expo.ios.bundleIdentifier, easProjectId: app.expo.extra.eas.projectId },
  introspection: { sha256: sha(introspectionBytes), CFBundleDisplayName: plist.CFBundleDisplayName, CFBundleDevelopmentRegion: plist.CFBundleDevelopmentRegion, CFBundleLocalizations: plist.CFBundleLocalizations },
  sourceHashes: { 'app.json': sha(read('app.json')), 'src/app/brand.ts': sha(read('src/app/brand.ts')), 'scripts/validate-release-identity.cjs': sha(read('scripts/validate-release-identity.cjs')) },
  boundary: 'CNG introspection only. Not a signed IPA; generic dev-launcher/ATS entries, native language/name, remote build number, production permissions and manifests require the actual production artifact.',
};
const out = path.resolve(args.out ?? path.join(root, '.expo/goal015/identity.json'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, appDiff, unchangedRuntimeFiles: stableRuntime.length, retainedTechnicalFiles: retainedOldNames.length, out }));
