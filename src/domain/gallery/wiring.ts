import { clamp } from '../firstPerson/geometry';
import type { Point2, WiringCheckpoint, WiringControl } from './types';

/** Independently authored center-line geometry. Pyllusion's Poggendorff
 * parameter separation is a reference; no Python source is translated. */
export const WIRING_SLOPE = Math.tan(40 * Math.PI / 180);
export const WIRING_INTERCEPT = -.1;
export const WIRING_TOLERANCE = .028;
export const WIRING_OFFSET_LIMITS = [-.28, .28] as const;
export const WIRING_COVER_LIMITS = [-.97, 0] as const;
export const WIRING_HANDLE_RADIUS = .15;
export const WIRING_HANDLE_HIT_RADIUS = .24;
export function initialWiring(compatibleBypass = false): WiringCheckpoint {
  return { offset: compatibleBypass ? 0 : .24, cover: 0, inspected: false, solved: compatibleBypass, attempts: 0, compatibleBypass };
}
export function wiringAligned(offset: number): boolean { return Number.isFinite(offset) && Math.abs(offset) <= WIRING_TOLERANCE + 1e-12; }
export function clampWiringValue(control: WiringControl, value: number): number {
  const limits = control === 'line' ? WIRING_OFFSET_LIMITS : WIRING_COVER_LIMITS;
  return clamp(value, limits[0], limits[1]);
}
/** Every coordinate is measured in meters on the same local plate. Cover
 * translation never enters either center-line equation or the decision. */
export function getWiringSpec(state: Pick<WiringCheckpoint, 'offset' | 'cover'>) {
  const m = WIRING_SLOPE, b = WIRING_INTERCEPT, offset = state.offset;
  const point = (x: number, delta: number): Point2 => ({ x, y: m * x + b + delta });
  return { m, b, offset, tolerance: WIRING_TOLERANCE,
    fixedLine: [point(-.72, 0), point(0, 0)] as const,
    movableLine: [point(0, offset), point(.72, offset)] as const,
    cover: { center: { x: state.cover, y: 0 }, width: .44, height: 1.5 },
    handles: { line: { center: { x: .96, y: m * .72 + b + offset }, radius: WIRING_HANDLE_RADIUS, hitRadius: WIRING_HANDLE_HIT_RADIUS },
      cover: { center: { x: state.cover, y: -.66 }, radius: WIRING_HANDLE_RADIUS, hitRadius: WIRING_HANDLE_HIT_RADIUS } },
    offsetLimits: WIRING_OFFSET_LIMITS, coverLimits: WIRING_COVER_LIMITS };
}
export function wiringHandleAt(state: Pick<WiringCheckpoint, 'offset' | 'cover'>, point: Point2): WiringControl | undefined {
  if (![point.x, point.y].every(Number.isFinite)) return undefined;
  const handles = getWiringSpec(state).handles;
  return (['line', 'cover'] as const).find(control => Math.abs(point.x - handles[control].center.x) <= handles[control].hitRadius && Math.abs(point.y - handles[control].center.y) <= handles[control].hitRadius);
}
