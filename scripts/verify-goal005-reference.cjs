#!/usr/bin/env node
'use strict';

// Read the real kit; compile both sources only into a fresh OS temporary directory.
// This is a core correspondence audit, not the standalone kit or native app suite.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--kit') {
  console.error('Usage: node scripts/verify-goal005-reference.cjs --kit /absolute/path/to/chroma-rift-goal-005');
  process.exit(2);
}
const kit = fs.realpathSync(args[1]);
const app = fs.realpathSync(path.resolve(path.dirname(fs.realpathSync(process.argv[1])), '..'));
assert.notEqual(kit, app, 'The reference kit must be separate from the application.');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'goal005-reference-audit-'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifestBytes = fs.readFileSync(path.join(kit, 'MANIFEST.sha256.json'));
const manifestSha256 = hash(manifestBytes);
assert.equal(manifestSha256, 'd4f53e091b5c484333ed04fd9da1954b840453befccb50fcc4cca4d4c2a68a24', 'Expected the verified original Goal 005 kit manifest.');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
assert.equal(Object.keys(manifest).length, 42, 'Expected the supplied 42-file kit manifest.');
for (const [filename, expected] of Object.entries(manifest)) {
  const source = path.resolve(kit, filename);
  assert.ok(source.startsWith(kit + path.sep), 'Manifest path must stay within the kit.');
  assert.equal(hash(fs.readFileSync(source)), expected, 'Manifest mismatch: ' + filename);
}

function compile(sourceDir, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const sources = fs.readdirSync(sourceDir).filter(name => name.endsWith('.ts')).map(name => path.join(sourceDir, name));
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10, ignoreDeprecations: '6.0',
    strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
    skipLibCheck: true, types: [], noEmitOnError: true, rootDir: sourceDir, outDir: destination };
  const program = ts.createProgram(sources, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => app, getNewLine: () => '\n',
  }));
  assert.equal(program.emit().emitSkipped, false, 'Core compilation must emit successfully.');
}
compile(path.join(kit, 'src/seal'), path.join(scratch, 'reference/build/seal'));
compile(path.join(app, 'src/domain/emblem'), path.join(scratch, 'application/build/seal'));
const reference = require(path.join(scratch, 'reference/build/seal'));
const integrated = require(path.join(scratch, 'application/build/seal'));
const testNames = ['stimulus.test.cjs', 'puzzle.test.cjs'];
const testHashes = {};
fs.mkdirSync(path.join(scratch, 'application/test'), { recursive: true });
for (const name of testNames) {
  const original = fs.readFileSync(path.join(kit, 'test', name));
  const target = path.join(scratch, 'application/test', name);
  fs.writeFileSync(target, original);
  testHashes[name] = hash(original);
  assert.equal(hash(fs.readFileSync(target)), testHashes[name]);
}
// The output layout preserves require('../build/seal'); even require text is unchanged.
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...testNames.map(name => 'test/' + name)],
  { cwd: path.join(scratch, 'application'), encoding: 'utf8' });
if (run.error) throw run.error;
fs.writeFileSync(path.join(scratch, 'original-tests-on-application.tap'), run.stdout + run.stderr);
assert.equal(run.status, 0, 'Original cases on application core failed:\n' + run.stdout + run.stderr);
const testCount = Number(run.stdout.match(/^# tests (\d+)$/m)?.[1]);
const passCount = Number(run.stdout.match(/^# pass (\d+)$/m)?.[1]);
assert.equal(testCount, 28); assert.equal(passCount, testCount);

let conditions = 0;
for (let seed = 0; seed < 100; seed++) {
  for (const palette of reference.PALETTE_IDS) for (const preference of ['red', 'blue', 'unknown']) {
    const original = reference.createSealStimulus(seed, palette, preference);
    const actual = integrated.createSealStimulus(seed, palette, preference);
    const label = `seed=${seed}, palette=${palette}, preference=${preference}`;
    assert.deepEqual(actual, original, 'Stimulus fields, paths and answer: ' + label);
    const originalMask = reference.buildCoverage(original, 128);
    const actualMask = integrated.buildCoverage(actual, 128);
    assert.deepEqual(actualMask, originalMask, 'Coverage: ' + label);
    for (const mode of ['color', 'neutral']) {
      const originalImage = reference.rasterizeSeal(original, originalMask, mode);
      const actualImage = integrated.rasterizeSeal(actual, actualMask, mode);
      assert.deepEqual(actualImage, originalImage, 'Raster ' + mode + ': ' + label);
      assert.deepEqual(integrated.bottomUpRGBA(actualImage), reference.bottomUpRGBA(originalImage), 'Texture rows ' + mode + ': ' + label);
    }
    conditions++;
  }
}
const goldens = JSON.parse(fs.readFileSync(path.join(app, 'src/domain/emblem/__tests__/preview-goldens.json'), 'utf8'));
assert.equal(goldens.sourceSha256, hash(fs.readFileSync(path.join(kit, 'preview.html'))), 'Existing preview provenance must match the supplied original.');
for (const record of goldens.records) {
  const stimulus = reference.createSealStimulus(record.seed, record.palette);
  const mask = reference.buildCoverage(stimulus, 128);
  const expected = { answer: stimulus.answer, geometryKey: stimulus.geometryKey,
    continuous: hash(mask.continuous), broken: hash(mask.broken),
    color: hash(reference.rasterizeSeal(stimulus, mask, 'color').rgba),
    neutral: hash(reference.rasterizeSeal(stimulus, mask, 'neutral').rgba) };
  for (const [key, value] of Object.entries(expected)) assert.equal(record[key], value, 'Existing preview golden: ' + record.seed + '/' + record.palette + '/' + key);
}
const sourceHashes = {};
for (const filename of Object.keys(manifest).filter(name => name.startsWith('src/seal/'))) sourceHashes[filename] = manifest[filename];
const summary = {
  kind: 'original-kit-to-application-core-audit', referencePath: kit, applicationPath: app,
  temporaryWorkspace: scratch, manifestSha256, manifestFilesVerified: 42, sourceHashes,
  originalTestsOnApplication: { passed: passCount, total: testCount, testHashes, byteIdenticalCopies: true, requireTextChanged: false },
  stimulusConditionsCompared: conditions, resolution: 128, presentations: ['color', 'neutral'],
  compared: ['version', 'seed', 'palette', 'preference', 'answer', 'distractor', 'paths', 'geometryKey', 'coverage', 'rgba', 'bottomUpRGBA'],
  existingPreviewGoldenRecords: goldens.records.length, existingPreviewGoldenAssertions: goldens.records.length * 6,
  originalPreviewSha256: goldens.sourceSha256,
  limitations: 'Core audit only; excludes native rendering, phone appearance and perceived depth. Standalone kit and complete application suites are separate.',
};
fs.writeFileSync(path.join(scratch, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
