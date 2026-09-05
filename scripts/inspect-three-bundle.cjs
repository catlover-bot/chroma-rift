const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('@babel/parser');
const { TraceMap, decodedMappings } = require('@jridgewell/trace-mapping');

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/inspect-three-bundle.cjs <export-directory> [--expect-single]');
const files = fs.readdirSync(directory, { recursive: true });
const bundleName = files.find((name) => name.endsWith('.js') && name.includes('/ios/'));
if (!bundleName) throw new Error('An iOS JavaScript bundle is required; export with --no-bytecode --source-maps.');
const code = fs.readFileSync(path.join(directory, bundleName), 'utf8');
const map = new TraceMap(JSON.parse(fs.readFileSync(path.join(directory, bundleName + '.map'), 'utf8')));
const mappings = decodedMappings(map);
const ast = parser.parse(code, { sourceType: 'script' });
const modules = new Map();
for (const statement of ast.program.body) {
  const call = statement.type === 'ExpressionStatement' && statement.expression;
  if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== '__d') continue;
  const [factory, id, dependencies, name] = call.arguments;
  if (!factory?.body || !id || dependencies?.type !== 'ArrayExpression') continue;
  let source = name?.type === 'StringLiteral' ? name.value : undefined;
  // Production omits the development module-name argument. Find a mapped
  // token inside this factory, skipping unmapped generated wrappers/helpers.
  for (let line = factory.loc.start.line - 1; !source && line < factory.loc.end.line; line += 1) {
    const mapping = (mappings[line] ?? []).find((segment) => segment.length >= 4 &&
      (line !== factory.loc.start.line - 1 || segment[0] >= factory.loc.start.column) &&
      (line !== factory.loc.end.line - 1 || segment[0] < factory.loc.end.column));
    if (mapping) source = map.resolvedSources[mapping[1]];
  }
  modules.set(id.value, { id: id.value, source, factory: code.slice(factory.start, factory.end), dependencies: dependencies.elements.map((value) => value?.value) });
}
const isThree = (source) => !!source && /(?:^|\/)node_modules\/three\/(?:build|src)\//.test(source);
const edges = [];
for (const module of modules.values()) {
  if (!module.source || !/(?:src\/rendering\/firstPerson\/|@react-three\/fiber\/)/.test(module.source)) continue;
  for (const id of module.dependencies) {
    const target = modules.get(id);
    if (isThree(target?.source)) edges.push({ origin: module.source, target: target.source, moduleId: id });
  }
}
if (!edges.some((edge) => edge.origin.includes('src/rendering/firstPerson/')) || !edges.some((edge) => edge.origin.includes('@react-three/fiber/'))) throw new Error('Could not identify both application and R3F Three edges from actual Metro output.');
// Evaluate only emitted Three factories, not application code or a simulated resolver.
const context = vm.createContext({ console });
const cache = new Map();
function load(id) {
  if (cache.has(id)) return cache.get(id).exports;
  const record = modules.get(id);
  if (!isThree(record?.source)) throw new Error('Unexpected dependency outside Three: ' + id);
  const module = { exports: {} };
  cache.set(id, module);
  const factory = vm.runInContext('(' + record.factory + ')', context, { filename: record.source });
  const importDefault = (key) => { const value = load(key); return value.__esModule ? value.default : value; };
  const importAll = (key) => { const value = load(key); return value.__esModule ? value : { ...value, default: value }; };
  factory(context, load, importDefault, importAll, module, module.exports, record.dependencies);
  return module.exports;
}
const entries = [...new Set(edges.map((edge) => edge.moduleId))].map((id) => load(id));
const identity = ['Vector3', 'Quaternion', 'Object3D', 'Mesh'].every((type) => entries.every((entry) => typeof entry[type] === 'function' && entry[type] === entries[0][type]));
const result = {
  bundle: path.resolve(directory, bundleName),
  threeSources: [...modules.values()].map((module) => module.source).filter(isThree),
  edges,
  sameClassIdentity: identity,
};
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes('--expect-single') && !identity) process.exitCode = 1;
