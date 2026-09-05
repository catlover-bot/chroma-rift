export type PointerId = number | string;
export type InputRegion = { width: number; height: number };
/** Fabric batches changed touches globally; targetTouches identifies this emitter. */
export function targetChangedTouches<T extends { identifier: PointerId }>(changed: readonly T[], target?: readonly T[]): readonly T[] {
  if (target) {
    const own = new Set(target.map((point) => point.identifier));
    return changed.filter((point) => own.has(point.identifier));
  }
  // Older event adapters without targetTouches are safe only for a single change.
  return changed.length === 1 ? changed : [];
}
export type FirstPersonInput = {
  stickPointer: PointerId | null;
  lookPointer: PointerId | null;
  right: number;
  forward: number;
  lookX: number;
  lookY: number;
  lastLookX: number;
  lastLookY: number;
};
export function createTouchInput(): FirstPersonInput {
  return { stickPointer: null, lookPointer: null, right: 0, forward: 0, lookX: 0, lookY: 0, lastLookX: 0, lastLookY: 0 };
}
export function clearTouchInput(input: FirstPersonInput): void {
  Object.assign(input, createTouchInput());
}
function inside(x: number, y: number, region: InputRegion) {
  return x >= 0 && y >= 0 && x <= region.width && y <= region.height;
}
export function beginStick(input: FirstPersonInput, id: PointerId, x: number, y: number, region: InputRegion): void {
  if (input.stickPointer !== null || input.lookPointer === id || !inside(x, y, region)) return;
  input.stickPointer = id;
  moveStick(input, id, x, y, region);
}
export function moveStick(input: FirstPersonInput, id: PointerId, x: number, y: number, region: InputRegion): void {
  if (input.stickPointer !== id) return;
  if (!inside(x, y, region)) { endPointer(input, id); return; }
  const radius = Math.min(region.width, region.height) * 0.42;
  const dx = (x - region.width / 2) / radius;
  const dy = (region.height / 2 - y) / radius;
  const magnitude = Math.hypot(dx, dy);
  const deadZone = 0.16;
  const amount = magnitude < deadZone ? 0 : Math.min(1, (magnitude - deadZone) / (1 - deadZone));
  input.right = amount > 0 ? dx / magnitude * amount : 0;
  input.forward = amount > 0 ? dy / magnitude * amount : 0;
}
export function beginLook(input: FirstPersonInput, id: PointerId, x: number, y: number, region: InputRegion): void {
  if (input.lookPointer !== null || input.stickPointer === id || !inside(x, y, region)) return;
  input.lookPointer = id;
  input.lastLookX = x;
  input.lastLookY = y;
}
export function moveLook(input: FirstPersonInput, id: PointerId, x: number, y: number, region: InputRegion): void {
  if (input.lookPointer !== id) return;
  if (!inside(x, y, region)) { endPointer(input, id); return; }
  input.lookX += x - input.lastLookX;
  input.lookY += y - input.lastLookY;
  input.lastLookX = x;
  input.lastLookY = y;
}
export function endPointer(input: FirstPersonInput, id: PointerId): void {
  if (input.stickPointer === id) {
    input.stickPointer = null;
    input.right = 0;
    input.forward = 0;
  }
  if (input.lookPointer === id) {
    input.lookPointer = null;
    input.lookX = 0;
    input.lookY = 0;
  }
}
export function consumeLook(input: FirstPersonInput): { x: number; y: number } {
  const delta = { x: input.lookX, y: input.lookY };
  input.lookX = 0;
  input.lookY = 0;
  return delta;
}
