import { analogStickVector, beginLook, beginStick, clearTouchInput, consumeLook, createTouchInput, endPointer, moveLook, moveStick, STICK_TRAVEL_RADIUS } from '../touchInput';

const region = { width: 180, height: 320 };
describe('floating analog first-person input', () => {
  it('starts at zero wherever the finger lands and then walks relative to that anchor', () => {
    const input = createTouchInput();
    beginStick(input, 1, 12, 280, region);
    expect([input.right, input.forward]).toEqual([0, 0]);
    moveStick(input, 1, 12, 230);
    expect(input.forward).toBe(1);
    expect(input.right).toBe(0);
    moveStick(input, 1, 12, 280);
    expect([input.right, input.forward]).toEqual([0, 0]);
  });
  it('uses a .14 radial dead zone, monotonic analog response and capped diagonals', () => {
    expect(analogStickVector(0, -STICK_TRAVEL_RADIUS * 0.14)).toEqual({ right: 0, forward: 0 });
    const speeds = [0.15, 0.3, 0.5, 0.8, 1, 2].map((ratio) => analogStickVector(0, -STICK_TRAVEL_RADIUS * ratio).forward);
    expect(speeds[0]).toBeGreaterThan(0);
    speeds.forEach((speed, index) => { if (index) expect(speed).toBeGreaterThanOrEqual(speeds[index - 1]!); });
    expect(speeds[4]).toBe(1);
    expect(speeds[5]).toBe(1);
    const diagonal = analogStickVector(500, -500);
    expect(Math.hypot(diagonal.right, diagonal.forward)).toBeCloseTo(1);
    expect(diagonal.right).toBeCloseTo(diagonal.forward);
  });
  it('keeps both IDs when they cross the activation boundaries and the midpoint', () => {
    const input = createTouchInput();
    beginStick(input, 1, 20, 250, region);
    beginLook(input, 2, 160, 100, region);
    moveStick(input, 1, 400, -100);
    moveLook(input, 2, -40, 450);
    expect(input.stickPointer).toBe(1);
    expect(input.lookPointer).toBe(2);
    expect(Math.hypot(input.right, input.forward)).toBeCloseTo(1);
    expect(Math.hypot(input.stickOffsetX, input.stickOffsetY)).toBeCloseTo(STICK_TRAVEL_RADIUS);
    expect(consumeLook(input)).toEqual({ x: -200, y: 350 });
    expect(consumeLook(input)).toEqual({ x: 0, y: 0 });
    expect(input.forward).toBeGreaterThan(0);
  });
  it('keeps a stationary displaced stick active and a stationary look finger still', () => {
    const input = createTouchInput();
    beginStick(input, 1, 60, 200, region);
    moveStick(input, 1, 60, 165);
    const amount = input.forward;
    beginLook(input, 2, 120, 100, region);
    moveLook(input, 2, 135, 105);
    expect(consumeLook(input)).toEqual({ x: 15, y: 5 });
    moveLook(input, 2, 135, 105);
    for (let frame = 0; frame < 20; frame += 1) {
      expect(consumeLook(input)).toEqual({ x: 0, y: 0 });
      expect(input.forward).toBe(amount);
    }
  });
  it('releases each owner independently and drops its queued deltas', () => {
    const input = createTouchInput();
    beginStick(input, 1, 60, 200, region);
    moveStick(input, 1, 60, 150);
    beginLook(input, 2, 120, 100, region);
    moveLook(input, 2, 130, 100);
    endPointer(input, 2);
    expect(input.forward).toBe(1);
    expect(input.lookPointer).toBeNull();
    expect(consumeLook(input)).toEqual({ x: 0, y: 0 });
    beginLook(input, 3, 140, 100, region);
    endPointer(input, 1);
    expect(input.forward).toBe(0);
    expect(input.lookPointer).toBe(3);
    clearTouchInput(input);
    expect(input).toEqual(createTouchInput());
  });
  it('does not let another ID take or share an owned control', () => {
    const input = createTouchInput();
    beginStick(input, 1, 60, 200, region);
    beginLook(input, 1, 120, 100, region);
    beginStick(input, 3, 100, 200, region);
    moveStick(input, 3, 150, 200);
    expect(input.lookPointer).toBeNull();
    expect(input.stickPointer).toBe(1);
    expect(input.right).toBe(0);
  });
  it('rejects malformed starts and stops only the owner of malformed movement', () => {
    const input = createTouchInput();
    beginStick(input, NaN, 50, 50, region);
    beginStick(input, 1, Infinity, 50, region);
    beginStick(input, 1, -1, 50, region);
    expect(input.stickPointer).toBeNull();
    beginStick(input, 1, 60, 200, region);
    beginLook(input, 2, 120, 100, region);
    moveStick(input, 1, NaN, 150);
    expect(input.stickPointer).toBeNull();
    expect(input.lookPointer).toBe(2);
    moveLook(input, 2, Infinity, 100);
    expect(input.lookPointer).toBeNull();
    expect(consumeLook(input)).toEqual({ x: 0, y: 0 });
  });
});
