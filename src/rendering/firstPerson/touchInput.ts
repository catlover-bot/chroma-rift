import { normalizedInput } from '../../domain/firstPerson/geometry';

export type PointerId = number | string;
export type InputRegion = { width: number; height: number };
type HeldContact = { id: PointerId; x: number; y: number };
export const STICK_TRAVEL_RADIUS = 50;
export const STICK_DIAMETER = 116;

/** Start events need emitter membership: Fabric changedTouches is global.
 * End/move events instead use a previously acquired ID, never this filter. */
export function targetChangedTouches<T extends { identifier: PointerId }>(changed: readonly T[], target?: readonly T[]): readonly T[] {
  if (target) {
    const own = new Set(target.map((point) => point.identifier));
    return changed.filter((point) => own.has(point.identifier));
  }
  return changed.length === 1 ? changed : [];
}
export type FirstPersonInput = {
  releaseBarrier: PointerId[];
  releaseBarrierMode: 'all' | 'owners';
  stickPointer: PointerId | null;
  lookPointer: PointerId | null;
  /** Only a normal mechanism release can rearm these contacts on fresh motion. */
  heldContacts: { stick?: HeldContact; look?: HeldContact };
  lastStickX: number;
  lastStickY: number;
  right: number;
  forward: number;
  lookX: number;
  lookY: number;
  stickOriginX: number;
  stickOriginY: number;
  stickOffsetX: number;
  stickOffsetY: number;
  lastLookX: number;
  lastLookY: number;
};
export function createTouchInput(): FirstPersonInput {
  return { releaseBarrier: [], releaseBarrierMode: 'all', stickPointer: null, lookPointer: null, heldContacts: {}, lastStickX: 0, lastStickY: 0, right: 0, forward: 0, lookX: 0, lookY: 0, stickOriginX: 0, stickOriginY: 0, stickOffsetX: 0, stickOffsetY: 0, lastLookX: 0, lastLookY: 0 };
}
export function clearTouchInput(input: FirstPersonInput): void {
  const { releaseBarrier, releaseBarrierMode } = input;
  Object.assign(input, createTouchInput(), { releaseBarrier, releaseBarrierMode });
}
/** Contact recovery keeps former owners suppressed until every finger lifts.
 * A newly started finger joins that barrier instead of gaining fresh control. */
export function requireAllPointersReleased(input: FirstPersonInput): void {
  const ids = [input.stickPointer, input.lookPointer].filter((id): id is PointerId => id !== null);
  input.releaseBarrier = [...new Set([...input.releaseBarrier, ...ids])];
  input.releaseBarrierMode = 'all';
  clearTouchInput(input);
}
/** Save contact positions, never their old movement/look vector. Capture and
 * lifecycle cancellation still use the strict all-fingers release boundary. */
export function suspendTouchForHold(input: FirstPersonInput): void {
  const heldContacts = { ...input.heldContacts };
  if (input.stickPointer !== null) heldContacts.stick = { id: input.stickPointer, x: input.lastStickX, y: input.lastStickY };
  if (input.lookPointer !== null) heldContacts.look = { id: input.lookPointer, x: input.lastLookX, y: input.lastLookY };
  requireAllPointersReleased(input);
  input.heldContacts = heldContacts;
}
export function clearHeldTouchInput(input: FirstPersonInput): void {
  const heldContacts = input.heldContacts;
  clearTouchInput(input);
  input.heldContacts = heldContacts;
}
/** Called by the contact's original region only. During a hold track its last
 * point; after release reanchor there and accept only a new displacement. */
export function moveHeldContact(input: FirstPersonInput, mode: 'stick' | 'look', id: PointerId, x: number, y: number): void {
  const contact = input.heldContacts[mode];
  if (!contact || contact.id !== id) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) { endPointer(input, id); return; }
  if (input.releaseBarrierMode === 'all') { contact.x = x; contact.y = y; return; }
  if (x === contact.x && y === contact.y) return;
  if ((mode === 'stick' ? input.stickPointer : input.lookPointer) !== null) return;
  input.releaseBarrier = input.releaseBarrier.filter(blocked => blocked !== id);
  delete input.heldContacts[mode];
  (mode === 'stick' ? beginStick : beginLook)(input, id, contact.x, contact.y);
  (mode === 'stick' ? moveStick : moveLook)(input, id, x, y);
}
/** A normal lever release retires old contacts, but does not make a newly
 * placed retreat finger wait for an unrelated old look contact. */
export function finishHeldRelease(input: FirstPersonInput): void {
  input.releaseBarrierMode = 'owners';
}
export function observeReleaseBarrier(input: FirstPersonInput, activeIds: readonly PointerId[]): void {
  for (const mode of ['stick', 'look'] as const) {
    const contact = input.heldContacts[mode];
    if (contact && !activeIds.includes(contact.id)) delete input.heldContacts[mode];
  }
  if (input.releaseBarrier.length) input.releaseBarrier = input.releaseBarrierMode === 'owners'
    ? input.releaseBarrier.filter(id => activeIds.includes(id)) : [...new Set(activeIds)];
}
function suppressedStart(input: FirstPersonInput, id: PointerId): boolean {
  if (!input.releaseBarrier.length) return false;
  if (input.releaseBarrierMode === 'owners') return input.releaseBarrier.includes(id);
  if (validPointer(id) && !input.releaseBarrier.includes(id)) input.releaseBarrier.push(id);
  return true;
}
export function validPointer(id: PointerId): boolean {
  return typeof id === 'number' ? Number.isFinite(id) : typeof id === 'string' && id.length > 0;
}
function validStart(id: PointerId, x: number, y: number, region?: InputRegion): boolean {
  return validPointer(id) && Number.isFinite(x) && Number.isFinite(y) && (!region || (
    Number.isFinite(region.width) && Number.isFinite(region.height) && region.width > 0 && region.height > 0 &&
    x >= 0 && y >= 0 && x <= region.width && y <= region.height
  ));
}
/** One radial response, shared with the movement domain: .14 dead zone,
 * monotonic linear speed, unit-circle saturation. Inputs are logical points. */
export function analogStickVector(dx: number, dy: number): { right: number; forward: number } {
  const result = normalizedInput({ strafe: dx / STICK_TRAVEL_RADIUS, forward: -dy / STICK_TRAVEL_RADIUS });
  return { right: result.strafe, forward: result.forward };
}
/** Native adapters already proved activation by the emitting hit view; direct
 * callers can additionally supply a local activation region. */
export function beginStick(input: FirstPersonInput, id: PointerId, x: number, y: number, region?: InputRegion): void {
  if (suppressedStart(input, id) || input.stickPointer !== null || input.lookPointer === id || !validStart(id, x, y, region)) return;
  input.stickPointer = id;
  input.stickOriginX = x;
  input.stickOriginY = y;
  input.lastStickX = x;
  input.lastStickY = y;
  input.right = input.forward = input.stickOffsetX = input.stickOffsetY = 0;
}
export function moveStick(input: FirstPersonInput, id: PointerId, x: number, y: number): void {
  if (input.stickPointer !== id) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) { endPointer(input, id); return; }
  input.lastStickX = x;
  input.lastStickY = y;
  const dx = x - input.stickOriginX;
  const dy = y - input.stickOriginY;
  const magnitude = Math.hypot(dx, dy);
  if (!Number.isFinite(magnitude)) { endPointer(input, id); return; }
  const cap = magnitude > STICK_TRAVEL_RADIUS ? STICK_TRAVEL_RADIUS / magnitude : 1;
  input.stickOffsetX = dx * cap;
  input.stickOffsetY = dy * cap;
  Object.assign(input, analogStickVector(dx, dy));
}
export function beginLook(input: FirstPersonInput, id: PointerId, x: number, y: number, region?: InputRegion): void {
  if (suppressedStart(input, id) || input.lookPointer !== null || input.stickPointer === id || !validStart(id, x, y, region)) return;
  input.lookPointer = id;
  input.lastLookX = x;
  input.lastLookY = y;
}
export function moveLook(input: FirstPersonInput, id: PointerId, x: number, y: number): void {
  if (input.lookPointer !== id) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) { endPointer(input, id); return; }
  const nextX = input.lookX + x - input.lastLookX;
  const nextY = input.lookY + y - input.lastLookY;
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) { endPointer(input, id); return; }
  input.lookX = nextX;
  input.lookY = nextY;
  input.lastLookX = x;
  input.lastLookY = y;
}
export function endPointer(input: FirstPersonInput, id: PointerId, discardLook = true): void {
  for (const mode of ['stick', 'look'] as const) if (input.heldContacts[mode]?.id === id) delete input.heldContacts[mode];
  input.releaseBarrier = input.releaseBarrier.filter(blocked => blocked !== id);
  if (input.stickPointer === id) {
    input.stickPointer = null;
    input.right = input.forward = input.stickOffsetX = input.stickOffsetY = 0;
  }
  if (input.lookPointer === id) {
    input.lookPointer = null;
    if (discardLook) input.lookX = input.lookY = 0;
  }
}
export function consumeLook(input: FirstPersonInput): { x: number; y: number } {
  const delta = { x: input.lookX, y: input.lookY };
  input.lookX = input.lookY = 0;
  return delta;
}
