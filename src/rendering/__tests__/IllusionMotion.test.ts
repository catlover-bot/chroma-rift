import { travelFacing } from '../IllusionMotion';

describe('explorer facing', () => {
  it('retains the last travel direction when the explorer lands', () => {
    const moving = travelFacing([{ x: 50, y: 20 }, { x: 10, y: 40 }], 1);
    expect(moving).toBe(-1);
    expect(travelFacing([{ x: 10, y: 40 }], moving)).toBe(-1);
  });

  it('keeps facing on vertical segments and reverses on deliberate horizontal travel', () => {
    expect(travelFacing([{ x: 10, y: 20 }, { x: 10, y: 40 }], -1)).toBe(-1);
    expect(travelFacing([{ x: 10, y: 40 }, { x: 50, y: 20 }], -1)).toBe(1);
  });
});
