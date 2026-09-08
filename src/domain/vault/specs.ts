import type { Vec3 } from '../firstPerson/types';
export const VAULT_SPEC_VERSION = 1;
/** Generous plane hit area shared by native interaction and projection QA. */
export const DEVICE_HANDLE_HIT_RADIUS = .30;
export const LENGTH_SPEC = Object.freeze({
  left: -.62, targetLength: 1.24, initialLength: .92, minLength: .68, maxLength: 1.52,
  referenceY: .32, sliderY: -.32, shaftWidth: .035, shaftDepth: .025, finLength: .22,
  finAngle: Math.PI / 4, tolerance: .035, handleRadius: .16,
});
export const ROD_SPEC = Object.freeze({
  frameAngle: 18 * Math.PI / 180, initialAngle: -13 * Math.PI / 180,
  length: 1.1, frameSize: 1.24, tolerance: 2.5 * Math.PI / 180, handleRadius: .16,
  // No arrowhead: endpoints are equivalent, so angles separated by pi match.
  period: Math.PI,
});
export function lengthMatches(length: number): boolean {
  return Number.isFinite(length) && Math.abs(length - LENGTH_SPEC.targetLength) <= LENGTH_SPEC.tolerance + 1e-12;
}
export function boundLength(length: number): number {
  return Math.max(LENGTH_SPEC.minLength, Math.min(LENGTH_SPEC.maxLength, length));
}
export function normalizeRodAngle(angle: number): number {
  return ((angle + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
}
/** Transform world gravity into the orthonormal board basis. Angle zero is
 * board-local +Y. As a bidirectional rod, +Y and -Y denote the same vertical. */
export function rodTargetAngle(right: Vec3, up: Vec3, gravity: Vec3 = { x: 0, y: -1, z: 0 }): number {
  const x = gravity.x * right.x + gravity.y * right.y + gravity.z * right.z;
  const y = gravity.x * up.x + gravity.y * up.y + gravity.z * up.z;
  return Math.hypot(x, y) > 1e-8 ? normalizeRodAngle(Math.atan2(x, y)) : NaN;
}
export function rodMatches(angle: number, targetAngle: number): boolean {
  return Number.isFinite(angle) && Number.isFinite(targetAngle) && Math.abs(normalizeRodAngle(angle - targetAngle)) <= ROD_SPEC.tolerance + 1e-12;
}
export function shaftEndpoints(length: number, reference = false) {
  const y = reference ? LENGTH_SPEC.referenceY : LENGTH_SPEC.sliderY;
  return [{ x: LENGTH_SPEC.left, y, z: LENGTH_SPEC.shaftDepth }, { x: LENGTH_SPEC.left + length, y, z: LENGTH_SPEC.shaftDepth }] as const;
}
export function rodEndpoints(angle: number) {
  const x = Math.sin(angle) * ROD_SPEC.length / 2, y = Math.cos(angle) * ROD_SPEC.length / 2;
  return [{ x: -x, y: -y, z: .025 }, { x, y, z: .025 }] as const;
}
/** Own geometry, not a translation of Pyllusion. Decorations are distinct from
 * shaft endpoints; toggling them never changes the measured segment. */
export function finSegments(length: number, reference = false) {
  const ends = shaftEndpoints(length, reference), direction = reference ? 1 : -1;
  return ends.flatMap((end, i) => [-1, 1].map(side => ({
    from: end,
    to: { x: end.x + (i === 0 ? 1 : -1) * direction * LENGTH_SPEC.finLength * Math.cos(LENGTH_SPEC.finAngle),
      y: end.y + side * LENGTH_SPEC.finLength * Math.sin(LENGTH_SPEC.finAngle), z: end.z },
  })));
}
export const CAFE_SPEC = Object.freeze({ width: 1.8, height: .9, rows: 5, tileWidth: .3, mortarWidth: .015, rowOffset: .15,
  dark: '#394442', light: '#B9B8A8', mortar: '#777D73' });
