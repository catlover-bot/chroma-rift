import { beginLook, beginStick, clearTouchInput, consumeLook, createTouchInput, endPointer, moveLook, moveStick } from '../touchInput';

const region = { width: 120, height: 120 };
describe('independent first-person touch pointers', () => {
  it('supports simultaneous stick and look with distinct pointers', () => {
    const input = createTouchInput();
    beginStick(input, 1, 60, 10, region);
    beginLook(input, 2, 40, 40, region);
    moveLook(input, 2, 60, 45, region);
    expect(input.forward).toBeGreaterThan(0.9);
    expect(consumeLook(input)).toEqual({ x: 20, y: 5 });
    expect(consumeLook(input)).toEqual({ x: 0, y: 0 });
    expect(input.forward).toBeGreaterThan(0.9);
  });
  it('does not claim the same pointer for both actions or let another pointer steal one', () => {
    const input = createTouchInput();
    beginStick(input, 1, 60, 10, region);
    beginLook(input, 1, 40, 40, region);
    beginStick(input, 3, 100, 60, region);
    expect(input.lookPointer).toBeNull();
    expect(input.stickPointer).toBe(1);
    moveStick(input, 3, 120, 60, region);
    expect(input.right).toBe(0);
  });
  it('zeros the relevant action when a touch ends or leaves its own region', () => {
    const input = createTouchInput();
    beginStick(input, 1, 60, 10, region);
    beginLook(input, 2, 40, 40, region);
    moveStick(input, 1, -1, 50, region);
    expect(input.forward).toBe(0);
    expect(input.lookPointer).toBe(2);
    moveLook(input, 2, 140, 40, region);
    expect(input.lookPointer).toBeNull();
    expect(consumeLook(input)).toEqual({ x: 0, y: 0 });
    beginStick(input, 3, 10, 10, region);
    endPointer(input, 3);
    expect(input.right).toBe(0);
  });
  it('resets all held inputs and pending camera deltas on cancellation, pause and background', () => {
    const input = createTouchInput();
    beginStick(input, 1, 100, 60, region);
    beginLook(input, 2, 40, 40, region);
    moveLook(input, 2, 60, 45, region);
    clearTouchInput(input);
    expect(input).toEqual(createTouchInput());
  });
  it('has a dead zone and normalized maximum diagonal magnitude', () => {
    const input = createTouchInput();
    beginStick(input, 1, 62, 61, region);
    expect(input.right).toBe(0);
    expect(input.forward).toBe(0);
    moveStick(input, 1, 110, 10, region);
    expect(Math.hypot(input.right, input.forward)).toBeCloseTo(1);
  });
});
