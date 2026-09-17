import ts from 'typescript';

// This test only needs these Node file APIs; app compiler types remain unchanged.
const fs = require('node:fs') as { readdirSync(path: string): string[]; readFileSync(path: string, encoding: 'utf8'): string };
const path = require('node:path') as { resolve(...parts: string[]): string; join(...parts: string[]): string };

const deny = /goal-014|release-js|\b(?:native|GL|renderer|framebuffer|checkpoint|schema|Runtime|Stage Kit|BGM|SE|RED_FRONT|BLUE_FRONT|VARIABLE|SOFT_DEPTH)\b|ランタイム|スキーマ|ハプティクス|原文|Development Build/;
const screens = path.resolve('src/screens');

it('keeps implementation terms out of authored screen literals with exact context exceptions', () => {
  const violations: string[] = [], exceptions = new Set<string>();
  const allowed = new Map([
    ['FirstPersonScreen.tsx:箱が見えない：生のGLを確認', '__DEV__ gated proof button inside explicit support'],
    ['SettingsScreen.tsx:一人称ランタイム検証', '__DEV__ gated developer tools inside explicit support'],
    ['NativeFirstPersonGate.tsx:native screen boundary', 'sanitized support-only failure phase'],
    ['NativeFirstPersonGate.tsx:ExpoGL native module is unavailable', 'sanitized support-only failure message'],
  ]);
  // The lab is reachable only through the explicit __DEV__ support tools; its
  // authored technical instructions are not player copy. Every other screen,
  // including legacy compatibility screens, is scanned.
  const files = [...fs.readdirSync(screens).filter(name => name.endsWith('.tsx') && name !== 'DeveloperLabScreen.tsx'), '../../App.tsx'];
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(screens, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if ((ts.isStringLiteralLike(node) || ts.isJsxText(node)) && deny.test(node.text)) {
        if (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) return;
        // Existing restoreOrigin JSON enum is machine data, not a rendered label.
        let ancestor: ts.Node | undefined = node.parent;
        while (ancestor && !ts.isPropertyAssignment(ancestor)) ancestor = ancestor.parent;
        if (file === 'FirstPersonScreen.tsx' && node.text === 'checkpoint' && ancestor && ts.isPropertyAssignment(ancestor) && ancestor.name.getText(source) === 'restoreOrigin') return;
        const key = `${file}:${node.text}`;
        if (allowed.has(key)) exceptions.add(key);
        else violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${node.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(files).toContain('FirstPersonScreen.tsx'); expect(files).toContain('NativeFirstPersonGate.tsx');
  expect(violations).toEqual([]);
  expect([...exceptions].sort()).toEqual([...allowed.keys()].sort());
});
