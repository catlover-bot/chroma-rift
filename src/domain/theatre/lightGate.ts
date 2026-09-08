import type { Vec3 } from '../firstPerson/types';
import { projectSilhouette, triangulateSilhouette } from './projection';
import type { LightProjection, Point2, ReceiverPlane, ReceiverWindow, Triangle3 } from './projection';

export const LIGHT_SPEC = Object.freeze({ minRail: -1, maxRail: 1, initialRail: 0, scale: .55, offset: { x: -1.4, y: .65, z: 0 }, handleRadius: .16, hitRadius: .55, railHalfLength: Math.hypot(1.5, 1.2) * .55 });
/** Original coat on a tiny stand, a single connected non-self-intersecting
 * silhouette. No licensed figure, no runtime threat identity, no alpha mask. */
export const COAT_OUTLINE: readonly Point2[] = [
  [-.16,.61],[.16,.61],[.16,.67],[.035,.67],[.035,.84],[.25,.84],[.19,1.05],[.34,1.02],[.38,1.08],[.25,1.38],[.075,1.41],[.085,1.48],[.065,1.59],[-.065,1.59],[-.085,1.48],[-.075,1.41],[-.25,1.38],[-.38,1.08],[-.34,1.02],[-.19,1.05],[-.25,.84],[-.035,.84],[-.035,.67],[-.16,.67],
].map(([x,y]) => Object.freeze({ x: x!, y: y! }));
export const COAT_TRIANGLES: readonly Triangle3[] = triangulateSilhouette(COAT_OUTLINE).map(t => t.map(p => ({ ...p, z: 2 })) as unknown as Triangle3);
export const LIGHT_RECEIVER: ReceiverPlane = { point: { x: 0, y: 0, z: 6 }, normal: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, bounds: { minX: -2.4, maxX: 2.4, minY: 0, maxY: 3.6 } };
export const LIGHT_WINDOWS: readonly ReceiverWindow[] = [-.55, .55].map((x, i) => ({ id: i ? 'left' : 'right', minX: x - .13, maxX: x + .13, minY: 1.05, maxY: 1.35 }));
export function clampRail(rail: number) { return Math.max(LIGHT_SPEC.minRail, Math.min(LIGHT_SPEC.maxRail, rail)); }
export function lightSource(rail: number): Vec3 { return { x: 1.5 * rail, y: 1.1, z: 1.2 * rail }; }
export function opticalWorldPoint(p: Vec3): Vec3 { const { scale, offset } = LIGHT_SPEC; return { x: offset.x + scale * p.x, y: offset.y + scale * p.y, z: offset.z + scale * p.z }; }
let cached: { rail:number; result:LightProjection } | undefined;
/** One bounded immutable entry: unchanged rail never clips geometry per frame. */
export function evaluateLight(rail: number):LightProjection {
  if(cached&&Object.is(cached.rail,rail))return cached.result;
  const result=projectSilhouette(Number.isFinite(rail) && rail >= -1 && rail <= 1 ? lightSource(rail) : { x: NaN, y: NaN, z: NaN }, COAT_TRIANGLES, LIGHT_RECEIVER, LIGHT_WINDOWS);
  Object.freeze(result.source);for(const polygon of result.polygons){for(const p of polygon)Object.freeze(p);Object.freeze(polygon);}Object.freeze(result.polygons);
  for(const w of result.windows)Object.freeze(w);Object.freeze(result.windows);Object.freeze(result);
  cached={rail,result};return result;
}
export function lightHandlePoint(rail: number): Point2 { return { x: -rail * LIGHT_SPEC.railHalfLength, y: 0 }; }
