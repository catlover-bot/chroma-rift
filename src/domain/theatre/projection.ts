import type { Vec3 } from '../firstPerson/types';

export type Point2 = { x: number; y: number };
export type Triangle3 = readonly [Vec3, Vec3, Vec3];
export type ReceiverWindow = { id: 'left' | 'right'; minX: number; maxX: number; minY: number; maxY: number };
export type ReceiverPlane = { point: Vec3; normal: Vec3; right: Vec3; up: Vec3; bounds: Omit<ReceiverWindow, 'id'> };
export type WindowIllumination = { id: ReceiverWindow['id']; coveredArea: number; area: number; coverage: number; lit: boolean };
export type LightProjection = { valid: boolean; source: Vec3; polygons: readonly (readonly Point2[])[]; windows: readonly WindowIllumination[]; canLock: boolean };
export const MAX_WINDOW_COVERAGE = .02;
const EPS = 1e-10;
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const finite = (p: Vec3) => [p.x, p.y, p.z].every(Number.isFinite);
export function projectPoint(source: Vec3, point: Vec3, plane: Pick<ReceiverPlane, 'point' | 'normal'>): Vec3 | undefined {
  if (![source, point, plane.point, plane.normal].every(finite)) return undefined;
  const ray = sub(point, source), denominator = dot(plane.normal, ray), numerator = dot(plane.normal, sub(plane.point, source));
  if (Math.abs(denominator) <= EPS || Math.abs(numerator) <= EPS) return undefined;
  const t = numerator / denominator;
  if (!Number.isFinite(t) || t <= 1 + EPS) return undefined;
  const result = { x: source.x + t * ray.x, y: source.y + t * ray.y, z: source.z + t * ray.z };
  return finite(result) ? result : undefined;
}
export function polygonArea(points: readonly Point2[]): number {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]!; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
}
export function clipRectangle(points: readonly Point2[], bounds: Omit<ReceiverWindow, 'id'>): Point2[] {
  let polygon = points.map(p => ({ ...p }));
  for (const [axis, edge, direction] of [['x', bounds.minX, 1], ['x', bounds.maxX, -1], ['y', bounds.minY, 1], ['y', bounds.maxY, -1]] as const) {
    const next: Point2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!, insideA = direction * (a[axis] - edge) >= -EPS, insideB = direction * (b[axis] - edge) >= -EPS;
      if (insideA) next.push(a);
      if (insideA !== insideB) { const t = (edge - a[axis]) / (b[axis] - a[axis]); next.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }); }
    }
    polygon = next;
  }
  return polygon;
}
const cross2 = (a: Point2, b: Point2, c: Point2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
/** Ear clipping of ONE simple silhouette: triangles partition its interior.
 * The receiver therefore sums disjoint areas, never overlapping alpha layers. */
export function triangulateSilhouette(points: readonly Point2[]): readonly (readonly [Point2, Point2, Point2])[] {
  if (points.length < 3 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new RangeError('Finite simple silhouette required');
  const winding = Math.sign(points.reduce((s, p, i) => { const q = points[(i + 1) % points.length]!; return s + p.x * q.y - q.x * p.y; }, 0));
  const remaining = points.map((_, i) => i), triangles: [Point2, Point2, Point2][] = [];
  while (remaining.length > 3) {
    let found = false;
    for (let j = 0; j < remaining.length; j++) {
      const indices = [remaining[(j + remaining.length - 1) % remaining.length]!, remaining[j]!, remaining[(j + 1) % remaining.length]!] as const;
      const [a, b, c] = indices.map(i => points[i]!) as [Point2, Point2, Point2];
      if (winding * cross2(a, b, c) <= EPS) continue;
      if (remaining.some(i => !indices.includes(i) && winding * cross2(a, b, points[i]!) >= -EPS && winding * cross2(b, c, points[i]!) >= -EPS && winding * cross2(c, a, points[i]!) >= -EPS)) continue;
      triangles.push([a, b, c]); remaining.splice(j, 1); found = true; break;
    }
    if (!found) throw new RangeError('Silhouette must be simple and non-degenerate');
  }
  triangles.push(remaining.map(i => points[i]!) as [Point2, Point2, Point2]);
  return triangles;
}
/** Input triangles MUST partition the opaque silhouette; the canonical source
 * is constructed that way above. Invalid rays fail closed, including when an
 * invalid triangle would otherwise disappear outside the receiver rectangle. */
export function projectSilhouette(source: Vec3, triangles: readonly Triangle3[], plane: ReceiverPlane, windows: readonly ReceiverWindow[]): LightProjection {
  const invalid = (): LightProjection => ({ valid: false, source, polygons: [], windows: windows.map(w => ({ id: w.id, area: (w.maxX - w.minX) * (w.maxY - w.minY), coveredArea: (w.maxX - w.minX) * (w.maxY - w.minY), coverage: 1, lit: false })), canLock: false });
  if (!triangles.length || !finite(plane.right) || !finite(plane.up) || Math.abs(dot(plane.normal, plane.normal) - 1) > EPS || Math.abs(dot(plane.right, plane.right) - 1) > EPS || Math.abs(dot(plane.up, plane.up) - 1) > EPS || Math.abs(dot(plane.normal, plane.right)) > EPS || Math.abs(dot(plane.normal, plane.up)) > EPS || Math.abs(dot(plane.right, plane.up)) > EPS) return invalid();
  if (![plane.bounds, ...windows].every(b => [b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite) && b.minX < b.maxX && b.minY < b.maxY) || windows.some(w => w.minX < plane.bounds.minX || w.maxX > plane.bounds.maxX || w.minY < plane.bounds.minY || w.maxY > plane.bounds.maxY)) return invalid();
  const polygons: Point2[][] = [];
  for (const triangle of triangles) {
    const projected = triangle.map(p => projectPoint(source, p, plane));
    if (projected.some(p => !p)) return invalid();
    const polygon = projected.map(p => { const relative = sub(p!, plane.point); return { x: dot(relative, plane.right), y: dot(relative, plane.up) }; });
    if (polygonArea(polygon) <= EPS) return invalid();
    polygons.push(clipRectangle(polygon, plane.bounds));
  }
  const readings = windows.map(w => {
    const area = (w.maxX - w.minX) * (w.maxY - w.minY), coveredArea = Math.max(0, Math.min(area, polygons.reduce((sum, p) => sum + polygonArea(clipRectangle(p, w)), 0))), coverage = coveredArea / area;
    return { id: w.id, area, coveredArea, coverage, lit: coverage <= MAX_WINDOW_COVERAGE + EPS };
  });
  return { valid: true, source, polygons, windows: readings, canLock: readings.length === 2 && readings.every(w => w.lit) };
}
