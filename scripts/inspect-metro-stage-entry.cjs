/* Execute the actual emitted Metro loader + factories in a fresh JS registry.
 * Native App/RN/GL mounting is deliberately outside this Node diagnostic. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');
const { TraceMap, decodedMappings } = require('@jridgewell/trace-mapping');
const directory = process.argv[2], sourceRoot = path.resolve(process.argv[3] || '.');
if (!directory) throw new Error('Usage: node scripts/inspect-metro-stage-entry.cjs <ios-js-export> [source-root] [--expect-acyclic]');
const bundleName = fs.readdirSync(directory, { recursive: true }).find(n => /\/ios\/.*\.js$/.test(n));
if (!bundleName) throw new Error('Export iOS JavaScript with --dev --no-bytecode --source-maps');
const code = fs.readFileSync(path.join(directory, bundleName), 'utf8');
const rawMap = JSON.parse(fs.readFileSync(path.join(directory, bundleName + '.map'), 'utf8'));
const map = new TraceMap(rawMap), mappings = decodedMappings(map);
const ast = parser.parse(code, { sourceType: 'script' });
const records = [];
let prelude, loader;
function relative(source) {
  const s = source?.replaceAll('\\', '/');
  if (!s || s.includes('node_modules/')) return undefined;
  const at = s.indexOf('src/');
  if (at >= 0 && !s.includes('node_modules/')) return s.slice(at);
  if (/(^|\/)(App|index)\.tsx?$/.test(s)) return s.split('/').pop();
  return undefined;
}
for (const statement of ast.program.body) {
  const text = code.slice(statement.start, statement.end);
  if (statement.type === 'VariableDeclaration' && text.includes('__BUNDLE_START_TIME__')) prelude = text;
  if (statement.type === 'ExpressionStatement' && text.includes('__registerSegment') && text.includes('Require cycle:')) loader = text;
  const call = statement.type === 'ExpressionStatement' && statement.expression;
  if (call?.type !== 'CallExpression') continue;
  if (call.callee.type !== 'Identifier' || call.callee.name !== '__d') {
    if (text.includes('__registerSegment') && text.includes('Require cycle:')) loader = text;
    continue;
  }
  const [factory, id, dependencies, name] = call.arguments;
  let source = name?.type === 'StringLiteral' ? name.value : undefined;
  for (let line = factory.loc.start.line - 1; !source && line < factory.loc.end.line; line++) {
    const segment = (mappings[line] || []).find(s => s.length >= 4 &&
      (line !== factory.loc.start.line - 1 || s[0] >= factory.loc.start.column) &&
      (line !== factory.loc.end.line - 1 || s[0] < factory.loc.end.column));
    if (segment) source = map.resolvedSources[segment[1]];
  }
  records.push({ id: id.value, source, relative: relative(source), text,
    dependencies: dependencies.elements.map(n => n?.value) });
}
assert(prelude && loader, 'Actual development prelude and Metro loader must be present');
const bySource = new Map(records.filter(r => r.relative).map(r => [r.relative, r]));
const correspondence = rawMap.sources.flatMap((source, i) => {
  const name = relative(source);
  if (!name) return [];
  const content = rawMap.sourcesContent?.[i];
  const local = fs.readFileSync(path.join(sourceRoot, name), 'utf8');
  return [{ source: name, matches: local === content,
    sha256: crypto.createHash('sha256').update(local).digest('hex') }];
});
assert(correspondence.length > 100 && correspondence.every(r => r.matches), 'Source map must match actual source');
const registryScript = new vm.Script(prelude + '\n' + loader + '\n' + records.map(r => r.text).join('\n'), { filename: 'actual-ios-development-bundle.js' });
const roots = [
  'src/domain/firstPerson/runtime.ts', 'src/domain/firstPerson/chapter.ts',
  'src/domain/gallery/runtime.ts', 'src/domain/vault/runtime.ts',
  'src/domain/theatre/runtime.ts', 'src/rendering/firstPerson/runtimeController.ts',
];
const missingRoots = roots.filter(s => !bySource.has(s));
const observations = [];
for (const first of roots.filter(s => bySource.has(s))) {
  const warnings = [], output = [];
  const context = vm.createContext({ console: {
    log: (...args) => output.push(args.map(String).join(' ')),
    warn: (...args) => warnings.push(args.map(String).join(' ')),
    error: (...args) => output.push(args.map(String).join(' ')),
  }, setTimeout, clearTimeout, performance });
  context.global = context;
  registryScript.runInContext(context, { timeout: 10000 });
  const read = s => context.__r(bySource.get(s).id);
  const observation = { first, warnings, output };
  try {
    read(first);
    for (const source of roots.filter(s => bySource.has(s))) read(source);
    const runtime = read(roots[0]), world = read(roots[1]), controller = read(roots[5]);
    const legacy = read('src/domain/firstPerson/chapter.ts').CHAPTER_ID;
    const ids = [legacy,
      read('src/domain/gallery/definition.ts').GALLERY_CHAPTER_ID,
      read('src/domain/vault/definition.ts').VAULT_CHAPTER_ID,
      read('src/domain/theatre/definition.ts').THEATRE_CHAPTER_ID];
    const threeRecord = records.find(r => /node_modules\/three\/build\/three\.cjs$/.test(r.source || ''));
    assert(threeRecord, 'Native Three target must be available');
    const THREE = context.__r(threeRecord.id);
    observation.chapters = ids.map(chapterId => {
      const r = runtime.createInitialRuntime(undefined, undefined, chapterId);
      const c = controller.createController(undefined, false, false, chapterId);
      const camera = new THREE.PerspectiveCamera();
      controller.syncCamera(c, camera);
      const geometry = world.getWorld(r);
      assert.equal(r.chapterId, chapterId);
      assert.equal(c.runtime.chapterId, chapterId);
      assert(c.runtime.session > r.session);
      assert(r.progress !== c.runtime.progress);
      for (const value of [...Object.values(r.pose.position), r.pose.yaw, r.pose.pitch, ...camera.projectionMatrix.elements]) assert(Number.isFinite(value));
      for (const solid of geometry.solids) for (const value of [...Object.values(solid.min), ...Object.values(solid.max)]) assert(Number.isFinite(value));
      return { chapterId, session: r.session, controllerSession: c.runtime.session,
        solids: geometry.solids.length, interactables: geometry.interactables.length, finite: true };
    });
    observation.passed = true;
  } catch (error) { observation.passed = false; observation.error = String(error.stack || error); }
  observation.executedFirstParty = [...context.__r.getModules().entries()].filter(([, r]) => r.isInitialized && relative(r.verboseName)).map(([, r]) => relative(r.verboseName)).sort();
  observations.push(observation);
}
const firstPartyCycles = [...new Set(observations.flatMap(o => o.warnings).filter(s => s.startsWith('Require cycle:')))];
const result = { scope: 'Actual emitted iOS development Metro loader/factories executed in isolated Node VM registries; domain/controller entries only. No RN App mount, native GL, audio bridge, or physical iPhone startup.',
  bundle: bundleName, bundleSha256: crypto.createHash('sha256').update(code).digest('hex'),
  loaderUnmodified: true, nativeDeviceStartup: 'not run', registeredModules: records.length,
  sourceCorrespondence: correspondence, missingRoots, observations, firstPartyCycles };
console.log(JSON.stringify(result, null, 2));
if (observations.some(o => !o.passed) || process.argv.includes('--expect-acyclic') && (firstPartyCycles.length || missingRoots.length)) process.exitCode = 1;
