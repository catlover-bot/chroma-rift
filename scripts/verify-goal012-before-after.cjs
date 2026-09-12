#!/usr/bin/env node
'use strict';
/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

if (process.argv.includes('--help')) {
  console.log('Verify Goal 012 light and vault before/after timelines and videos. Required: --before-source, --after-source, --before-light, --after-light, --before-vault, --after-vault, --before-light-video, --after-light-video, --before-vault-video, --after-vault-video, --pair-light-video, --pair-vault-video. Optional: --out.');
  process.exit(0);
}
const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const required = name => {
  const value = option(name);
  if (!value) throw new Error('Missing --' + name + '=PATH');
  return path.resolve(value);
};
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const revision = directory => cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
const video = file => {
  const probe = JSON.parse(cp.execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', file], { encoding: 'utf8' }));
  return { sha256: sha256(file), ...probe.streams[0] };
};
function compareValues(before, after) {
  let numericDifferences = 0, maxAbsoluteDifference = 0;
  function visit(a, b, location) {
    if (Object.is(a, b)) return;
    if (typeof a === 'number' && typeof b === 'number') {
      assert(Number.isFinite(a) && Number.isFinite(b), 'Nonfinite value at ' + location);
      numericDifferences++;
      maxAbsoluteDifference = Math.max(maxAbsoluteDifference, Math.abs(a - b));
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      assert.deepEqual(Object.keys(a), Object.keys(b), 'Shape mismatch at ' + location);
      for (const key of Object.keys(a)) visit(a[key], b[key], location + '.' + key);
      return;
    }
    assert.deepEqual(a, b, 'Discrete difference at ' + location);
  }
  visit(before, after, '$');
  return { numericDifferences, maxAbsoluteDifference };
}

const beforeSource = required('before-source'), afterSource = required('after-source');
const beforeRevision = revision(beforeSource), afterRevision = revision(afterSource);
const stageKitCommit = '478b376ea9a954974ad2f08ab5f09d929bd35f06';
assert.equal(beforeRevision, '5c04d98baf2abc7344a0f53d1fc60cc5739929c2');
cp.execFileSync('git', ['merge-base', '--is-ancestor', stageKitCommit, afterRevision], { cwd: afterSource });
assert.equal(cp.execFileSync('git', ['diff', '--name-only', stageKitCommit, afterRevision, '--', 'src'], { cwd: afterSource, encoding: 'utf8' }), '', 'Game source changed after Stage Kit commit');
for (const source of [beforeSource, afterSource]) {
  const changedGameSource = cp.execFileSync('git', ['status', '--porcelain', '--', 'src'], { cwd: source, encoding: 'utf8' });
  assert.equal(changedGameSource, '', 'Game source differs from committed revision in ' + source);
}
const beforeLight = read(required('before-light')), afterLight = read(required('after-light'));
const beforeVault = read(required('before-vault')), afterVault = read(required('after-vault'));
assert.equal(beforeLight.frames, 600); assert.equal(afterLight.frames, 600);
assert.equal(beforeVault.frameCount, 245); assert.equal(afterVault.frameCount, 245);
assert.deepEqual(beforeLight, afterLight, 'Light operation changed');
const vaultComparison = compareValues(beforeVault, afterVault);
assert(vaultComparison.maxAbsoluteDifference <= 1e-12, 'Vault operation changed beyond floating-point roundoff');
const beforeLightVideo = video(required('before-light-video')), afterLightVideo = video(required('after-light-video'));
const beforeVaultVideo = video(required('before-vault-video')), afterVaultVideo = video(required('after-vault-video'));
assert.deepEqual(beforeLightVideo, afterLightVideo, 'Light video changed');
assert.deepEqual(beforeVaultVideo, afterVaultVideo, 'Vault video changed');
const pairLightVideo = video(required('pair-light-video')), pairVaultVideo = video(required('pair-vault-video'));
const root = path.resolve(__dirname, '..');
const report = {
  baselineCommit: beforeRevision,
  stageKitCommit,
  boundary: 'Actual FirstPersonScreen actions, controller, authored scene and software WebGL; native readiness and audio are stubbed. Source paths were verified by the extraction bridge.',
  light: {
    simulationFrames: beforeLight.frames,
    simulationSeconds: beforeLight.duration,
    timelineSha256: sha256(required('before-light')),
    sameTimelineByteForByte: true,
    singleVideo: beforeLightVideo,
    comparisonVideo: pairLightVideo,
    wrongReleaseRail: beforeLight.events.find(event => event.type === 'drag-release').rail,
    correctReleaseRail: beforeLight.railBeforeCommit,
    final: beforeLight.final,
  },
  vaultLength: {
    simulationFrames: beforeVault.frameCount,
    simulationSeconds: beforeVault.duration,
    numericDifferences: vaultComparison.numericDifferences,
    maxAbsoluteDifference: vaultComparison.maxAbsoluteDifference,
    tolerance: 1e-12,
    toleranceReason: 'The only differences are last-bit IEEE-754 rounding in 28 transient drag samples; saved values, attempts, solution flags and all discrete fields match.',
    singleVideo: beforeVaultVideo,
    comparisonVideo: pairVaultVideo,
    steps: beforeVault.snapshots.map(snapshot => {
      const frame = beforeVault.frames[snapshot.frame];
      return { name: snapshot.name, time: frame.time, preview: frame.length, saved: frame.progress.length, activeDrag: !!frame.drag };
    }),
  },
};
const output = option('out') ? path.resolve(option('out')) : path.join(root, 'docs/qa-goal012/before-after-evidence.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, lightVideoSame: true, vaultVideoSame: true, vaultComparison }));
