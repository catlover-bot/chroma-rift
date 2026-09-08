import { createVaultRuntime } from '../../domain/vault/runtime';
import { LENGTH_SPEC, ROD_SPEC, shaftEndpoints, rodEndpoints, CAFE_SPEC } from '../../domain/vault/specs';
import { createVaultComparisons, vaultComparison, vaultComparisonPrimitives } from '../vaultComparisons';
const state = () => createVaultComparisons(createVaultRuntime().progress.vault!);
it('removes only decorations and adds guide lines while retaining physical shaft endpoints and widths', () => {
  const s = state(), before = vaultComparisonPrimitives('length', s);
  const after = vaultComparisonPrimitives('length', { ...s, aids: { ...s.aids, finsHidden: true, lengthGuide: true } });
  const shafts = before.lines.filter(l => l.id.endsWith('-shaft'));
  expect(after.lines.filter(l => l.id.endsWith('-shaft'))).toEqual(shafts);
  expect(shafts).toHaveLength(2);
  for (const [index, reference] of [true, false].entries()) {
    const ends = shaftEndpoints(reference ? LENGTH_SPEC.targetLength : s.length, reference);
    expect(shafts[index]).toMatchObject({ from: { x: ends[0].x, y: ends[0].y }, to: { x: ends[1].x, y: ends[1].y }, width: LENGTH_SPEC.shaftWidth });
  }
  expect(after.lines.filter(l => l.id.includes('-fin-'))).toHaveLength(0);
  expect(after.lines.filter(l => l.id.startsWith('measurement-guide')).map(l => l.from.x)).toEqual([LENGTH_SPEC.left, LENGTH_SPEC.left + LENGTH_SPEC.targetLength]);
  expect(vaultComparison('length', s).rgba).not.toEqual(vaultComparison('length', { ...s, aids: { ...s.aids, finsHidden: true } }).rgba);
});
it('keeps rod endpoints independent from frame and plumb and treats half-turns as the same unoriented shaft', () => {
  const s = state(), original = vaultComparisonPrimitives('rod', s);
  const changed = vaultComparisonPrimitives('rod', { ...s, aids: { ...s.aids, frameHidden: true, plumb: true } });
  expect(changed.lines.find(l => l.id === 'rod-shaft')).toEqual(original.lines.find(l => l.id === 'rod-shaft'));
  expect(changed.lines.filter(l => l.id.startsWith('tilted-frame'))).toHaveLength(0);
  const plumb = changed.lines.find(l => l.id === 'plumb')!;
  expect(plumb.from.x).toBeCloseTo(plumb.to.x, 10);
  const ends = rodEndpoints(s.angle), halfTurn = rodEndpoints(s.angle + ROD_SPEC.period);
  expect(ends[0].x).toBeCloseTo(halfTurn[1].x); expect(ends[0].y).toBeCloseTo(halfTurn[1].y);
  expect(ends[1].x).toBeCloseTo(halfTurn[0].x); expect(ends[1].y).toBeCloseTo(halfTurn[0].y);
});
it('neutralizes cafe tile color without moving, bending or thickening any tile or mortar row', () => {
  const s = state(), original = vaultComparisonPrimitives('cafe', s);
  const neutral = vaultComparisonPrimitives('cafe', { ...s, aids: { ...s.aids, cafeNeutral: true } });
  expect(original.tiles.map(({ color: _color, ...tile }) => tile)).toEqual(neutral.tiles.map(({ color: _color, ...tile }) => tile));
  expect(new Set(neutral.tiles.map(t => t.color))).toEqual(new Set([CAFE_SPEC.light]));
  expect(neutral.background).toBe(original.background);
  expect(new Set(neutral.tiles.map(t => t.y)).size).toBe(CAFE_SPEC.rows);
  expect(vaultComparison('cafe', s).rgba).not.toEqual(vaultComparison('cafe', { ...s, aids: { ...s.aids, cafeNeutral: true } }).rgba);
});
