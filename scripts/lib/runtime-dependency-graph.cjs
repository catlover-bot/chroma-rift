'use strict';
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const babel = require('@babel/core');
const traverse = require('@babel/traverse').default;
const metroResolve = require('metro-resolver').resolve;
const toolRoot = path.resolve(__dirname, '../..');
const expoPreset = require.resolve('babel-preset-expo', { paths: [path.dirname(require.resolve('expo/package.json'))] });
// Use the installed Expo preset's actual TS stripping options, including
// implicit type-use import removal; do not guess from import text.
const erasure = require(path.join(path.dirname(expoPreset), 'configs/typescript.js')).getConfig();
const codeExtension = /\.(?:[cm]?[jt]sx?)$/;
const declaration = /\.d\.(?:[cm]?ts)$/;
const testOnly = /(?:^|\/)(?:__tests__|__mocks__|testFixtures)(?:\/|$)|\.(?:test|spec)\.[^.]+$/;
const slash = value => value.split(path.sep).join('/');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const inside = (root, file) => { const r = path.relative(root, file); return r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); };
const isFile = filename => { try { return fs.statSync(filename).isFile(); } catch { return false; } };
function packageInfo(filename, root) {
  let dir = path.dirname(filename);
  while (inside(root, dir)) {
    const file = path.join(dir, 'package.json');
    if (isFile(file)) return { rootPath: dir, packageJson: JSON.parse(fs.readFileSync(file, 'utf8')), packageRelativePath: path.relative(dir, filename) };
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return null;
}
function names(pattern) {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'ObjectPattern') return pattern.properties.flatMap(p => p.type === 'RestElement' ? ['*'] : names(p.value));
  if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap(names);
  if (pattern.type === 'AssignmentPattern') return names(pattern.left);
  return ['*'];
}
function requireSymbols(p) {
  const parent = p.parentPath?.node;
  if (parent?.type === 'MemberExpression' && parent.object === p.node) return [parent.computed ? parent.property.value ?? '*' : parent.property.name];
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'ObjectPattern') return parent.id.properties.map(item => item.type === 'RestElement' ? '*' : item.key.name ?? item.key.value);
  return ['*'];
}
function dependencies(ast) {
  const edges = [];
  const add = (node, specifier, kind, symbols) => edges.push({ specifier, kind, symbols, line: node.loc?.start.line ?? 0 });
  traverse(ast, {
    ImportDeclaration(p) {
      add(p.node, p.node.source.value, 'import', p.node.specifiers.map(s => s.imported?.name ?? s.imported?.value ?? (s.type === 'ImportDefaultSpecifier' ? 'default' : '*')));
    },
    ExportNamedDeclaration(p) { if (p.node.source) add(p.node, p.node.source.value, 're-export', p.node.specifiers.map(s => s.local?.name ?? s.local?.value ?? '*')); },
    ExportAllDeclaration(p) { add(p.node, p.node.source.value, 're-export', ['*']); },
    CallExpression(p) {
      const n = p.node, isRequire = n.callee.type === 'Identifier' && n.callee.name === 'require' && !p.scope.getBinding('require');
      if (!isRequire && n.callee.type !== 'Import') return;
      const arg = n.arguments[0], specifier = arg?.type === 'StringLiteral' ? arg.value : arg?.type === 'TemplateLiteral' && arg.expressions.length === 0 ? arg.quasis[0].value.cooked : null;
      add(n, specifier, isRequire ? 'require' : 'dynamic-import', isRequire ? requireSymbols(p) : ['*']);
    },
    ImportExpression(p) { add(p.node, p.node.source.type === 'StringLiteral' ? p.node.source.value : null, 'dynamic-import', ['*']); },
  });
  return edges;
}
function parseSource(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const options = { filename, configFile: false, babelrc: false, ...erasure, parserOpts: { sourceType: 'unambiguous', plugins: ['jsx'] } };
  const before = dependencies(babel.parseSync(source, options));
  const ast = babel.transformSync(source, { ...options, ast: true, code: false }).ast;
  const runtime = dependencies(ast), erased = [];
  for (const old of before) {
    const retained = runtime.find(e => e.kind === old.kind && e.specifier === old.specifier && e.line === old.line);
    const symbols = retained ? old.symbols.filter(symbol => !retained.symbols.includes(symbol)) : old.symbols;
    if (!retained || symbols.length) erased.push({ ...old, symbols, reason: 'installed Expo TypeScript runtime erasure' });
  }
  const topLevel = [];
  for (let node of ast.program.body) {
    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') node = node.declaration;
    if (!node) continue;
    if (node.type === 'VariableDeclaration') for (const item of node.declarations) topLevel.push({ symbols: names(item.id), kind: node.kind, line: item.loc?.start.line ?? 0, initializer: item.init?.type ?? null });
    else if (['FunctionDeclaration', 'ClassDeclaration', 'ExpressionStatement'].includes(node.type)) topLevel.push({ symbols: node.id ? [node.id.name] : [], kind: node.type, line: node.loc?.start.line ?? 0, initializer: node.type === 'FunctionDeclaration' ? null : node.type });
  }
  return { hash: hash(source), runtime, erased, topLevel };
}
function configFor(root, override) {
  const file = path.join(root, 'tsconfig.json'), read = ts.readConfigFile(file, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, file);
  const errors = config.errors.filter(e => e.code !== 18003);
  if (errors.length) throw new Error(errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join('\n'));
  const metro = override ?? require(path.join(toolRoot, 'metro.config.js')).resolver;
  return { tsOptions: config.options, resolver: metro, tsconfigHash: hash(fs.readFileSync(file)), tsconfig: read.config };
}
function aliasCandidates(specifier, options, root) {
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) return null;
  const patterns = Object.keys(options.paths ?? {}).filter(pattern => {
    const i = pattern.indexOf('*');
    return i < 0 ? specifier === pattern : specifier.startsWith(pattern.slice(0, i)) && specifier.endsWith(pattern.slice(i + 1));
  }).sort((a, b) => (b.includes('*') ? b.indexOf('*') : Infinity) - (a.includes('*') ? a.indexOf('*') : Infinity));
  const pattern = patterns[0];
  if (!pattern) return null;
  const i = pattern.indexOf('*'), match = i < 0 ? '' : specifier.slice(i, specifier.length - (pattern.length - i - 1));
  const base = options.baseUrl ?? options.pathsBasePath ?? root;
  return options.paths[pattern].map(target => path.resolve(base, target.replace('*', match)));
}
function createResolver(root, config, platform) {
  const { resolver, tsOptions } = config;
  return (from, edge) => {
    if (edge.specifier === null) return { error: 'Nonliteral runtime require/import cannot be certified statically' };
    const specifier = edge.specifier, aliases = aliasCandidates(specifier, tsOptions, root);
    const relative = specifier.startsWith('.') || path.isAbsolute(specifier), subpath = specifier.startsWith('#');
    let candidates = aliases ?? (relative ? [path.resolve(path.dirname(from), specifier)] : subpath ? [specifier] : []);
    if (!candidates.length && tsOptions.baseUrl) {
      const resolved = ts.resolveModuleName(specifier, from, tsOptions, ts.sys).resolvedModule?.resolvedFileName;
      if (resolved && inside(root, resolved) && !resolved.includes(path.sep + 'node_modules' + path.sep)) candidates = [path.resolve(tsOptions.baseUrl, specifier)];
    }
    if (!candidates.length) return { external: specifier };
    const warnings = [];
    const context = {
      originModulePath: from, sourceExts: resolver.sourceExts, assetExts: new Set(resolver.assetExts),
      mainFields: resolver.resolverMainFields ?? ['react-native', 'browser', 'main'],
      preferNativePlatform: platform !== 'neutral', allowHaste: false, disableHierarchicalLookup: true,
      nodeModulesPaths: [], extraNodeModules: {}, customResolverOptions: {}, isESMImport: edge.kind !== 'require',
      unstable_enablePackageExports: true, unstable_conditionNames: resolver.unstable_conditionNames ?? [],
      unstable_conditionsByPlatform: resolver.unstable_conditionsByPlatform ?? {},
      unstable_logWarning: warning => warnings.push(warning),
      getPackage: file => isFile(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null,
      getPackageForModule: file => packageInfo(file, root),
      doesFileExist: isFile,
      fileSystemLookup(file) { try { const stat = fs.statSync(file); return { exists: true, type: stat.isDirectory() ? 'd' : 'f', realPath: fs.realpathSync(file) }; } catch { return { exists: false }; } },
      resolveAsset(dir, name, extension) {
        const candidate = path.join(dir, name + extension);
        if (isFile(candidate)) return [candidate];
        if (!fs.existsSync(dir)) return null;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const variants = fs.readdirSync(dir).filter(f => new RegExp('^' + escaped + '@[0-9.]+x' + extension.replace('.', '\\.') + '$').test(f)).map(f => path.join(dir, f));
        return variants.length ? variants : null;
      },
      resolveHasteModule: () => null, resolveHastePackage: () => null,
    };
    let lastError;
    for (const candidate of candidates) {
      try {
        const result = metroResolve(context, candidate, platform === 'neutral' ? null : platform);
        if (warnings.length) return { error: warnings.join('; ') };
        if (result.type === 'empty') return { error: 'First-party runtime dependency was redirected to an empty module' };
        const files = result.type === 'assetFiles' ? result.filePaths : [result.filePath];
        if (files.some(file => !inside(root, file))) return { error: 'Local runtime dependency escapes project root' };
        return { files, terminal: result.type === 'assetFiles' || files.every(file => !codeExtension.test(file)) };
      } catch (error) { lastError = error.message; }
    }
    return { error: 'Unresolved in-repository runtime specifier: ' + specifier + '; ' + lastError };
  };
}
function stronglyConnected(nodes, edges) {
  const allowed = new Set(nodes), adjacency = new Map(nodes.map(n => [n, []]));
  for (const edge of edges) if (allowed.has(edge.from) && allowed.has(edge.to)) adjacency.get(edge.from).push(edge);
  const indices = new Map(), low = new Map(), stack = [], active = new Set(), groups = []; let index = 0;
  function visit(node) {
    indices.set(node, index); low.set(node, index++); stack.push(node); active.add(node);
    for (const edge of adjacency.get(node)) {
      if (!indices.has(edge.to)) { visit(edge.to); low.set(node, Math.min(low.get(node), low.get(edge.to))); }
      else if (active.has(edge.to)) low.set(node, Math.min(low.get(node), indices.get(edge.to)));
    }
    if (indices.get(node) !== low.get(node)) return;
    const members = []; let current;
    do { current = stack.pop(); active.delete(current); members.push(current); } while (current !== node);
    if (members.length > 1 || adjacency.get(node).some(e => e.to === node)) {
      members.sort(); const set = new Set(members), internalEdges = edges.filter(e => set.has(e.from) && set.has(e.to));
      const start = members[0];
      function cycle(currentNode, seen) {
        for (const edge of adjacency.get(currentNode).filter(e => set.has(e.to))) {
          if (edge.to === start) return [edge];
          if (!seen.has(edge.to)) { const result = cycle(edge.to, new Set([...seen, edge.to])); if (result) return [edge, ...result]; }
        }
        return null;
      }
      groups.push({ members, edges: internalEdges, representativeCycle: cycle(start, new Set([start])) });
    }
  }
  nodes.forEach(node => { if (!indices.has(node)) visit(node); });
  return groups.sort((a, b) => a.members[0].localeCompare(b.members[0]));
}
function reachable(roots, edges) {
  const seen = new Set(), adjacency = new Map();
  for (const edge of edges) { if (!adjacency.has(edge.from)) adjacency.set(edge.from, []); adjacency.get(edge.from).push(edge.to); }
  function visit(node) { if (seen.has(node)) return; seen.add(node); for (const next of adjacency.get(node) ?? []) visit(next); }
  roots.forEach(visit); return [...seen].sort();
}
function scanProject(options = {}) {
  const root = path.resolve(options.root ?? toolRoot), config = configFor(root, options.resolver);
  const sourceFiles = [], excluded = [];
  function collect(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name), relative = slash(path.relative(root, file));
      if (item.isDirectory()) { if (item.name !== 'node_modules') collect(file); }
      else if (codeExtension.test(file)) {
        if (testOnly.test(relative) || declaration.test(file)) excluded.push(relative);
        else sourceFiles.push(file);
      }
    }
  }
  for (const dir of options.sourceDirectories ?? ['src']) collect(path.resolve(root, dir));
  const pkgFile = path.join(root, 'package.json'), pkg = isFile(pkgFile) ? JSON.parse(fs.readFileSync(pkgFile, 'utf8')) : {};
  const appRoots = options.appEntrypoints ?? [pkg.main ?? 'index.tsx', 'App.tsx'].filter(file => isFile(path.resolve(root, file)));
  const directRoots = options.directEntrypoints ?? [
    'src/domain/firstPerson/index.ts', 'src/domain/firstPerson/chapter.ts', 'src/domain/firstPerson/runtime.ts',
    'src/domain/gallery/index.ts', 'src/domain/vault/runtime.ts', 'src/domain/vault/checkpoint.ts', 'src/domain/vault/world.ts',
    'src/domain/theatre/index.ts', 'src/rendering/firstPerson/runtimeController.ts',
    'src/rendering/firstPerson/galleryController.ts', 'src/rendering/firstPerson/vaultController.ts', 'src/rendering/firstPerson/theatreController.ts',
  ].filter(file => isFile(path.resolve(root, file)));
  for (const entry of [...appRoots, ...directRoots]) {
    const file = path.resolve(root, entry);
    if (!isFile(file)) throw new Error('Missing supported entrypoint: ' + entry);
    if (!sourceFiles.includes(file)) sourceFiles.push(file);
  }
  const platformNames = new Set(['ios', 'android', 'native', 'web', 'tvos', 'macos']);
  const suffixOf = file => { const match = file.match(/\.([^.\/]+)\.[^.]+$/); return match && platformNames.has(match[1]) ? match[1] : null; };
  const platforms = options.platforms ?? [...new Set(['ios', 'android', 'neutral', ...sourceFiles.map(suffixOf).filter(p => p && p !== 'native')])];
  const parsed = new Map(), parsingErrors = [];
  for (const file of sourceFiles.sort()) {
    try { parsed.set(file, parseSource(file)); }
    catch (error) { parsingErrors.push({ file: slash(path.relative(root, file)), error: error.message }); }
  }
  const reports = platforms.map(platform => {
    const selected = sourceFiles.filter(file => { const suffix = suffixOf(file); return !suffix || suffix === platform || suffix === 'native' && platform !== 'neutral' && platform !== 'web'; });
    const pending = [...selected], visited = new Set(), edges = [], assets = [], externals = [], errors = [...parsingErrors], erased = [], modules = {};
    const resolve = createResolver(root, config, platform);
    while (pending.length) {
      const file = pending.pop(); if (visited.has(file)) continue; visited.add(file);
      const from = slash(path.relative(root, file));
      let data = parsed.get(file);
      if (!data) { try { data = parseSource(file); parsed.set(file, data); } catch (error) { errors.push({ file: from, error: error.message }); continue; } }
      modules[from] = { sha256: data.hash, topLevel: data.topLevel };
      erased.push(...data.erased.map(edge => ({ from, ...edge })));
      for (const edge of data.runtime) {
        const item = { from, ...edge }, resolution = resolve(file, edge);
        if (resolution.error) { errors.push({ ...item, error: resolution.error }); continue; }
        if (resolution.external) { externals.push(item); continue; }
        for (const target of resolution.files) {
          const to = slash(path.relative(root, target));
          if (resolution.terminal) { assets.push({ ...item, to, sha256: hash(fs.readFileSync(target)) }); continue; }
          if (testOnly.test(to) || declaration.test(to)) { errors.push({ ...item, to, error: 'Runtime edge targets test-only or declaration-only source' }); continue; }
          edges.push({ ...item, to });
          if (!visited.has(target)) pending.push(target);
        }
      }
    }
    edges.sort((a, b) => (a.from + ':' + a.line + ':' + a.to).localeCompare(b.from + ':' + b.line + ':' + b.to));
    const nodes = Object.keys(modules).sort(), appReachable = reachable(appRoots, edges), directReachable = reachable(directRoots, edges);
    const reached = new Set([...appReachable, ...directReachable]);
    return {
      platform, coverage: { allProduction: nodes, appEntrypoints: appRoots, directEntrypoints: directRoots, appReachable, directReachable,
        unreachableFromSupportedEntrypoints: nodes.filter(n => !reached.has(n)), excludedPlatformVariants: sourceFiles.filter(f => !selected.includes(f)).map(f => slash(path.relative(root, f))) },
      counts: { production: nodes.length, runtimeEdges: edges.length, assets: assets.length, externalEdges: externals.length, erasedEdges: erased.length },
      sccs: stronglyConnected(nodes, edges), appReachableSccs: stronglyConnected(appReachable, edges), directReachableSccs: stronglyConnected(directReachable, edges),
      edges, erasedEdges: erased, assets, externals, errors, modules,
    };
  });
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), scope: 'All eligible first-party production sources, plus reachable local sources; app/direct-entry reachability is reported separately. External packages and assets are boundaries. Static potential runtime graph, not executed native startup.',
    tooling: { typescript: ts.version, babel: babel.version, runtimeErasure: 'installed babel-preset-expo configs/typescript via Babel', resolver: 'installed metro-resolver; tsconfig extends/paths/baseUrl via TypeScript', sourceExts: config.resolver.sourceExts, tsconfigSha256: config.tsconfigHash, baseUrl: config.tsOptions.baseUrl ? slash(path.relative(root, config.tsOptions.baseUrl)) : null, paths: config.tsOptions.paths ?? {} },
    excludedTestAndDeclarations: excluded.sort(), reports, ok: reports.every(report => report.errors.length === 0 && report.sccs.length === 0),
  };
}
function formatSummary(report) {
  return report.reports.map(item => {
    const lines = [item.platform + ': ' + item.counts.production + ' production modules, ' + item.counts.runtimeEdges + ' runtime edges, ' + item.sccs.length + ' SCCs, ' + item.errors.length + ' errors'];
    for (const group of item.sccs) {
      lines.push('  SCC: ' + group.members.join(', '));
      for (const edge of group.representativeCycle) lines.push('    ' + edge.from + ':' + edge.line + ' --' + edge.kind + ' {' + edge.symbols.join(', ') + '}--> ' + edge.to);
    }
    for (const error of item.errors) lines.push('  ERROR ' + (error.file ?? error.from) + (error.line ? ':' + error.line : '') + ': ' + error.error);
    return lines.join('\n');
  }).join('\n');
}
module.exports = { scanProject, formatSummary, stronglyConnected };
