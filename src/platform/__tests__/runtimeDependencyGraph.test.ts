// Keep Node-only scanner tooling out of the application's global TS types.
declare const __dirname: string;
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs') as {
  mkdtempSync(prefix: string): string; mkdirSync(path: string, options: { recursive: true }): void;
  writeFileSync(path: string, data: string): void; rmSync(path: string, options: { recursive: true; force: true }): void;
};
const { tmpdir } = require('node:os') as { tmpdir(): string };
const { dirname, join, resolve } = require('node:path') as { dirname(path: string): string; join(...paths: string[]): string; resolve(...paths: string[]): string };
const { execFileSync } = require('node:child_process') as { execFileSync(file: string, args: string[], options: { cwd: string; encoding: 'utf8' }): string };
const { scanProject, formatSummary } = require('../../../scripts/lib/runtime-dependency-graph.cjs') as {
  scanProject(options?: Record<string, unknown>): {
    ok: boolean; reports: {
      platform: string; counts: { production: number; runtimeEdges: number };
      coverage: { appReachable: string[]; directReachable: string[]; allProduction: string[]; unreachableFromSupportedEntrypoints: string[] };
      errors: { error: string; specifier?: string; to?: string }[];
      sccs: { members: string[]; representativeCycle: { from: string; to: string; symbols: string[]; kind: string }[] }[];
      edges: { from: string; to: string; symbols: string[]; kind: string }[];
      erasedEdges: { specifier: string; symbols: string[] }[];
      assets: { to: string }[];
    }[];
  };
  formatSummary(report: unknown): string;
};

// Metro config must load under Node's actual package conditions, not Jest's
// browser condition (which would resolve yaml/browser in the Metro CLI graph).
const projectRoot = resolve(__dirname, '../../..');
const resolver = JSON.parse(execFileSync(process.execPath, ['-e',
  'const r=require("./metro.config.js").resolver; process.stdout.write(JSON.stringify({sourceExts:r.sourceExts,assetExts:r.assetExts,resolverMainFields:r.resolverMainFields,unstable_conditionNames:r.unstable_conditionNames,unstable_conditionsByPlatform:r.unstable_conditionsByPlatform}));',
], { cwd: projectRoot, encoding: 'utf8' }));

function fixture(files: Record<string, string>, run: (report: ReturnType<typeof scanProject>) => void, config: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'chroma-cycle-fixture-'));
  try {
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', module: 'preserve', ...config }, include: ['src/**/*'] }));
    for (const [name, source] of Object.entries(files)) { const file = join(root, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, source); }
    run(scanProject({ root, resolver, appEntrypoints: ['src/entry.ts'], directEntrypoints: [] }));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

it('guards all production sources and app/direct stage reachability, rather than only the ten logged paths', () => {
  const report = scanProject({ root: projectRoot, resolver });
  expect(report.reports.map(item => item.platform)).toEqual(expect.arrayContaining(['ios', 'android', 'neutral']));
  for (const item of report.reports) {
    expect(item.counts.production).toBeGreaterThan(150);
    expect(item.coverage.appReachable).toEqual(expect.arrayContaining([
      'App.tsx', 'src/screens/FirstPersonScreen.tsx', 'src/domain/theatre/runtime.ts',
      'src/domain/gallery/state.ts', 'src/domain/vault/runtime.ts', 'src/domain/firstPerson/runtime.ts',
      'src/rendering/firstPerson/runtimeController.ts',
    ]));
    expect(item.coverage.directReachable).toContain('src/domain/firstPerson/chapter.ts');
    expect(item.coverage.allProduction.some(file => file.includes('/testFixtures/') || file.includes('/__tests__/'))).toBe(false);
  }
  expect(formatSummary(report)).not.toContain('ERROR');
  expect(report.ok ? '' : formatSummary(report)).toBe('');
});

it('finds a runtime SCC and reports its exact symbols and representative import paths', () => {
  fixture({
    'src/entry.ts': "import { b } from './b'; export const a=()=>b;",
    'src/b.ts': "import { a } from './entry'; export const b=()=>a;",
  }, report => {
    for (const item of report.reports) {
      expect(item.sccs[0]!.members).toEqual(['src/b.ts', 'src/entry.ts']);
      expect(item.sccs[0]!.representativeCycle).toEqual(expect.arrayContaining([
        expect.objectContaining({ from: 'src/b.ts', to: 'src/entry.ts', symbols: ['a'], kind: 'import' }),
        expect.objectContaining({ from: 'src/entry.ts', to: 'src/b.ts', symbols: ['b'], kind: 'import' }),
      ]));
    }
    expect(report.ok).toBe(false);
  });
});

it('erases explicit and implicit type-only cycles according to the installed Expo transform', () => {
  fixture({
    'src/entry.ts': "import type { B } from './b'; export interface A { b?:B }",
    'src/b.ts': "import { A } from './entry'; export interface B { a?:A }",
  }, report => {
    expect(report.ok).toBe(true);
    report.reports.forEach(item => {
      expect(item.edges).toEqual([]);
      expect(item.erasedEdges).toEqual(expect.arrayContaining([
        expect.objectContaining({ specifier: './b', symbols: ['B'] }), expect.objectContaining({ specifier: './entry', symbols: ['A'] }),
      ]));
    });
  });
});

it('retains only runtime symbols in mixed imports while preserving an actual side-effect edge', () => {
  fixture({
    'src/entry.ts': "import { type B, value } from './b'; import './effects'; export const a:B={ n:value };",
    'src/b.ts': "import type { a } from './entry'; export type B={n:number}; export const value=2;",
    'src/effects.ts': 'globalThis.fixtureSideEffect=true;',
  }, report => {
    expect(report.ok).toBe(true);
    for (const item of report.reports) {
      expect(item.edges).toEqual(expect.arrayContaining([
        expect.objectContaining({ from: 'src/entry.ts', to: 'src/b.ts', symbols: ['value'] }),
        expect.objectContaining({ from: 'src/entry.ts', to: 'src/effects.ts', symbols: [] }),
      ]));
      expect(item.edges.some(edge => edge.from === 'src/b.ts')).toBe(false);
    }
  });
});

it('includes runtime barrel re-exports but excludes export type edges', () => {
  fixture({
    'src/entry.ts': "export { value } from './barrel'; export type { T } from './types';",
    'src/barrel/index.ts': "export * from '../loop';",
    'src/loop.ts': "export { value } from './entry';",
    'src/types.ts': "export type T=string;",
  }, report => {
    expect(report.ok).toBe(false);
    report.reports.forEach(item => {
      expect(item.sccs[0]!.members).toEqual(['src/barrel/index.ts', 'src/entry.ts', 'src/loop.ts']);
      expect(item.sccs[0]!.representativeCycle.every(edge => edge.kind === 're-export')).toBe(true);
      expect(item.edges.some(edge => edge.to === 'src/types.ts')).toBe(false);
    });
  });
});

it('includes deferred literal require and dynamic import so hiding a cycle cannot satisfy the guard', () => {
  fixture({
    'src/entry.ts': "export function load(){const {value}=require('./b'); return value;}",
    'src/b.ts': "export const value=()=>import('./entry');",
  }, report => {
    expect(report.ok).toBe(false);
    report.reports.forEach(item => {
      expect(item.edges).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'require', symbols: ['value'] }),
        expect.objectContaining({ kind: 'dynamic-import', to: 'src/entry.ts' }),
      ]));
    });
  });
});

it('resolves tsconfig aliases with iOS/native, Android/native and neutral file selection', () => {
  fixture({
    'src/entry.ts': "import { target } from '@chapter/device'; export const current=target;",
    'src/device.ts': 'export const target="neutral";',
    'src/device.native.ts': 'export const target="native";',
    'src/device.ios.ts': 'export const target="ios";',
    'src/device.android.ts': 'export const target="android";',
  }, report => {
    expect(report.ok).toBe(true);
    const expected: Record<string, string> = { ios: 'src/device.ios.ts', android: 'src/device.android.ts', neutral: 'src/device.ts' };
    report.reports.forEach(item => expect(item.edges.find(edge => edge.from === 'src/entry.ts')!.to).toBe(expected[item.platform]));
  }, { baseUrl: '.', paths: { '@chapter/*': ['src/*'] } });
  fixture({
    'src/entry.ts': "import { target } from './device'; export const current=target;",
    'src/device.ts': 'export const target="neutral";', 'src/device.native.ts': 'export const target="native";',
  }, report => {
    expect(report.ok).toBe(true);
    report.reports.forEach(item => expect(item.edges[0]!.to).toBe(item.platform === 'neutral' ? 'src/device.ts' : 'src/device.native.ts'));
  });
});

it('fails unresolved local/alias imports, declarations used at runtime, and computed runtime loading', () => {
  for (const [source, specifier] of [
    ["import './absent';", './absent'], ["export { value } from '@chapter/absent';", '@chapter/absent'],
    ["export const x=require('./types.d.ts');", './types.d.ts'],
    ["export const x=require('./' + globalThis.whichModule);", null],
  ] as const) {
    fixture({ 'src/entry.ts': source, 'src/types.d.ts': 'export declare const value:number;' }, report => {
      expect(report.ok).toBe(false);
      report.reports.forEach(item => expect(item.errors).toEqual(expect.arrayContaining([expect.objectContaining({ specifier })])));
    }, { baseUrl: '.', paths: { '@chapter/*': ['src/*'] } });
  }
});

it('checks asset existence as terminal dependencies and does not substitute TS for an explicit missing JS path', () => {
  fixture({
    'src/entry.ts': "export const data=require('./data.json'); export const image=require('./image.png');",
    'src/data.json': '{"n":1}', 'src/image.png': 'fixture image bytes only, never rendered',
  }, report => {
    expect(report.ok).toBe(true);
    report.reports.forEach(item => expect(item.assets.map(asset => asset.to).sort()).toEqual(['src/data.json', 'src/image.png']));
  });
  fixture({ 'src/entry.ts': "import { x } from './implementation.js'; export const n=x;", 'src/implementation.ts': 'export const x=1;' }, report => expect(report.ok).toBe(false));
});

it('reports unreachable production cycles instead of mislabeling an acyclic entry subset as the whole application', () => {
  fixture({
    'src/entry.ts': 'export const entry=1;',
    'src/dormant.ts': "export { value } from './loop';", 'src/loop.ts': "export { value } from './dormant';",
    'src/testFixtures/not-production.ts': "import './missing';",
    'src/__tests__/not-production.test.ts': "import './missing';",
  }, report => {
    expect(report.ok).toBe(false);
    report.reports.forEach(item => {
      expect(item.coverage.appReachable).toEqual(['src/entry.ts']);
      expect(item.coverage.unreachableFromSupportedEntrypoints).toEqual(['src/dormant.ts', 'src/loop.ts']);
      expect(item.errors).toEqual([]);
    });
  });
});
