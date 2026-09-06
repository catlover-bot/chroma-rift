import { controlLayout, type ControlRect } from '../controlLayout';

function overlap(a: ControlRect, b: ControlRect) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}
describe('safe-area scene control layout', () => {
  it.each([
    [320, 568, 20, 0], [390, 844, 47, 34], [430, 932, 59, 34],
  ])('keeps thumb activation apart from all HUD actions at %i × %i', (width, height, topInset, bottomInset) => {
    for (const fontScale of [1, 1.5, 2]) {
      for (const hand of ['left', 'right'] as const) {
        const availableHeight = height - topInset - bottomInset;
        const layout = controlLayout(width, availableHeight, fontScale, hand);
        for (const action of [layout.pause, layout.action, layout.color]) {
          expect(action.width).toBeGreaterThanOrEqual(44);
          expect(action.height).toBeGreaterThanOrEqual(44);
          expect(overlap(layout.movement, action)).toBe(false);
          expect(overlap(layout.look, action)).toBe(false);
        }
        expect(overlap(layout.movement, layout.look)).toBe(false);
        expect(overlap(layout.action, layout.color)).toBe(false);
        expect(overlap(layout.pause, layout.goal)).toBe(false);
        for (const rect of [layout.movement, layout.look, layout.pause, layout.goal, layout.action, layout.color]) {
          expect(rect.left).toBeGreaterThanOrEqual(12);
          expect(rect.top).toBeGreaterThanOrEqual(12);
          expect(rect.left + rect.width).toBeLessThanOrEqual(width - 12);
          expect(rect.top + rect.height).toBeLessThanOrEqual(availableHeight - 12);
        }
        expect(layout.movement.width).toBeGreaterThanOrEqual(116);
        expect(layout.movement.height).toBeGreaterThanOrEqual(116);
        expect(layout.look.height).toBeGreaterThan(200);
      }
    }
  });
  it('makes room for wrapped two-line action text when fonts grow and mirrors both action paths', () => {
    const ordinary = controlLayout(390, 763, 1);
    const large = controlLayout(390, 763, 2);
    const left = controlLayout(390, 763, 2, 'left');
    expect(large.action.height).toBeGreaterThanOrEqual(16 * 2 * 2 + 24);
    expect(large.action.height).toBeGreaterThan(ordinary.action.height);
    expect(left.action.left).toBe(large.color.left);
    expect(left.movement.left).toBe(large.look.left);
  });
});
