import type { ContourCheckpoint, DiscAngles, DiscId, Point2 } from './types';

export const CONTOUR_BACKGROUND = '#E8E4D8';
export const CONTOUR_INK = '#202329';
export const CONTOUR_TOLERANCE = 8 * Math.PI / 180;
export const CONTOUR_DISC_RADIUS = 0.2286;
export const CONTOUR_WEDGE_ANGLE = Math.PI / 3;
export const CONTOUR_VERTICES: readonly Point2[] = [{ x: 0, y: 0.58 }, { x: -Math.sqrt(3) * 0.275, y: -0.245 }, { x: Math.sqrt(3) * 0.275, y: -0.245 }];
export const CONTOUR_CENTROID = { x: 0, y: 0.03 };
export const CONTOUR_DISC_IDS = [0, 1, 2] as const;
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) throw new RangeError('Angle must be finite.');
  // Preserve already canonical values exactly across save/reload and pointer pickup.
  if (angle >= -Math.PI && angle < Math.PI) return angle;
  return ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}
export function angularDifference(a: number, b: number): number { return Math.abs(normalizeAngle(a - b)); }
/** Local coordinates use x right/y up, including pointer positions and mesh rotation.
 * Only the inducing discs are part of the ordinary drawing. The guide is separate. */
export function createContourSpec(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Invalid contour seed.');
  const centroid = { x: CONTOUR_VERTICES.reduce((sum, point) => sum + point.x, 0) / 3, y: CONTOUR_VERTICES.reduce((sum, point) => sum + point.y, 0) / 3 };
  const discs = CONTOUR_VERTICES.map((center, index) => ({ id: index as DiscId, center, radius: CONTOUR_DISC_RADIUS,
    wedgeAngle: CONTOUR_WEDGE_ANGLE, targetAngle: Math.atan2(centroid.y - center.y, centroid.x - center.x) }));
  return { seed, centroid, discs, background: CONTOUR_BACKGROUND, ink: CONTOUR_INK,
    normalLayers: ['background', 'inducers'] as const, guide: { points: CONTOUR_VERTICES, dashed: true, label: '輪郭ガイド' } as const };
}
export function initialContour(seed: number): ContourCheckpoint {
  const spec = createContourSpec(seed);
  return { seed, inspected: false, solved: false, attempts: 0,
    angles: spec.discs.map((disc, index) => normalizeAngle(disc.targetAngle + [0.72, -1.05, 1.32][(index + seed % 3) % 3]!)) as DiscAngles };
}
export function contourAligned(seed: number, angles: readonly number[]): boolean {
  return angles.length === 3 && angles.every(Number.isFinite) && createContourSpec(seed).discs.every(disc => angularDifference(angles[disc.id]!, disc.targetAngle) <= CONTOUR_TOLERANCE + 1e-12);
}
/** Pixel/geometry consumers share this hit function. No triangle fill is hidden here. */
export function contourInkAt(point: Point2, angles: readonly number[]): boolean {
  return createContourSpec(0).discs.some(disc => {
    const dx = point.x - disc.center.x, dy = point.y - disc.center.y;
    return Math.hypot(dx, dy) <= disc.radius && angularDifference(Math.atan2(dy, dx), angles[disc.id]!) >= disc.wedgeAngle / 2;
  });
}
