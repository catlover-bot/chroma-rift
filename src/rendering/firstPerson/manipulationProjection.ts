import { Matrix4, Vector3 } from 'three';
import { cameraMatchesPose, projectWithCamera } from '../../domain/firstPerson/alignment';
import { segmentOccluded } from '../../domain/firstPerson/geometry';
import type { CameraMatrices, CollisionVolume, InteractableDefinition, PlayerPose, Vec3, WorldGeometry } from '../../domain/firstPerson/types';


/** Separating-axis test of the complete eye→rectangle pyramid and an opaque
 * world AABB. A thin blocker between sampled rays still rejects entry. */
function pyramidIntersectsBox(vertices: Vector3[], box: CollisionVolume): boolean {
  const coords = ['x', 'y', 'z'] as const;
  if (coords.some(axis => Math.max(...vertices.map(v => v[axis])) <= box.min[axis] + 1e-7 ||
    Math.min(...vertices.map(v => v[axis])) >= box.max[axis] - 1e-7)) return false;
  const boxVertices = [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].flatMap(y =>
    [box.min.z, box.max.z].map(z => new Vector3(x, y, z))));
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  const sides = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [1, 2, 3]];
  for (const [a, b, c] of sides) axes.push(new Vector3().crossVectors(vertices[b!]!.clone().sub(vertices[a!]!), vertices[c!]!.clone().sub(vertices[a!]!)));
  const edges = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1]];
  for (const [a, b] of edges) {
    const edge = vertices[b!]!.clone().sub(vertices[a!]!);
    for (const axis of axes.slice(0, 3)) axes.push(new Vector3().crossVectors(edge, axis));
  }
  return !axes.some(axis => {
    if (axis.lengthSq() < 1e-12) return false;
    axis.normalize();
    const panel = vertices.map(v => v.dot(axis)), blocker = boxVertices.map(v => v.dot(axis));
    return Math.max(...panel) <= Math.min(...blocker) + 1e-7 || Math.max(...blocker) <= Math.min(...panel) + 1e-7;
  });
}

export type PanelPoint = { x: number; y: number };
function basis(target: InteractableDefinition) {
  const r = target.rectangle;
  if (!r || ![r.width, r.height, ...Object.values(target.center), ...Object.values(r.normal), ...Object.values(r.right)].every(Number.isFinite) ||
    r.width <= 0 || r.height <= 0 || !Number.isFinite(target.maxDistance) || target.maxDistance <= 0) return;
  const normal = new Vector3(r.normal.x, r.normal.y, r.normal.z), right = new Vector3(r.right.x, r.right.y, r.right.z);
  if (Math.abs(normal.length() - 1) > 1e-5 || Math.abs(right.length() - 1) > 1e-5 || Math.abs(normal.dot(right)) > 1e-5) return;
  return { ...r, normal, right, up: new Vector3().crossVectors(normal, right), center: new Vector3(target.center.x, target.center.y, target.center.z) };
}
export function fixturePointInWorld(target: InteractableDefinition, point: PanelPoint): Vec3 | undefined {
  const b = basis(target);
  if (!b || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  return b.center.clone().addScaledVector(b.right, point.x).addScaledVector(b.up, point.y);
}
/** Explicit entry requires the whole device in view. No camera repositioning or
 * pixel-ratio assumptions: matrices belong to the current presented camera. */
export function fixtureFullyVisible(pose: PlayerPose, matrices: CameraMatrices | undefined, world: WorldGeometry, target: InteractableDefinition): boolean {
  const b = basis(target);
  if (!b || !matrices || !cameraMatchesPose(pose, matrices)) return false;
  const eye = new Vector3(pose.position.x, pose.position.y, pose.position.z);
  const distance = eye.clone().sub(b.center);
  if (distance.dot(b.normal) <= 0.08 || distance.length() > target.maxDistance) return false;
  const corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) =>
    b.center.clone().addScaledVector(b.right, x! * b.width).addScaledVector(b.up, y! * b.height));
  if (world.solids.some(solid => solid.opaque && solid.id !== target.id + '-body' && pyramidIntersectsBox([eye, ...corners], solid))) return false;
  return [b.center, ...corners].every(point => {
    const projected = projectWithCamera(point, matrices);
    return !!projected && Math.abs(projected.x) < .98 && Math.abs(projected.y) < .98 &&
      !segmentOccluded(pose.position, point, world, target.id + '-body');
  });
}
/** RN local logical points -> NDC -> world ray -> authored panel coordinates.
 * Out-of-bounds drops return undefined; callers roll back the current drag. */
export function pointOnFixture(pose: PlayerPose, matrices: CameraMatrices | undefined, world: WorldGeometry, target: InteractableDefinition,
  screen: PanelPoint, width: number, height: number): PanelPoint | undefined {
  if (![screen.x, screen.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
    screen.x < 0 || screen.x > width || screen.y < 0 || screen.y > height || !fixtureFullyVisible(pose, matrices, world, target)) return;
  const b = basis(target)!;
  const projection = new Matrix4().fromArray(matrices!.projection), view = new Matrix4().fromArray(matrices!.view);
  const combined = projection.multiply(view);
  if (Math.abs(combined.determinant()) < 1e-12) return;
  const point = new Vector3(screen.x / width * 2 - 1, 1 - screen.y / height * 2, .5).applyMatrix4(combined.invert());
  const origin = new Vector3(pose.position.x, pose.position.y, pose.position.z);
  const direction = point.sub(origin).normalize();
  const dot = direction.dot(b.normal);
  if (dot >= -1e-6) return;
  const t = b.center.clone().sub(origin).dot(b.normal) / dot;
  if (!Number.isFinite(t) || t < .08 || t > target.maxDistance + Math.hypot(b.width, b.height)) return;
  const hit = origin.addScaledVector(direction, t);
  if (!projectWithCamera(hit, matrices!) || segmentOccluded(pose.position, hit, world, target.id + '-body')) return;
  const offset = hit.sub(b.center);
  const local = { x: offset.dot(b.right), y: offset.dot(b.up) };
  return Math.abs(local.x) <= b.width / 2 && Math.abs(local.y) <= b.height / 2 ? local : undefined;
}

export function fixtureScreenBounds(target: InteractableDefinition, matrices: CameraMatrices | undefined, width: number, height: number) {
  if (!matrices || !target.rectangle || ![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
  const points = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => {
    const world = fixturePointInWorld(target, { x: x! * target.rectangle!.width, y: y! * target.rectangle!.height });
    return world && projectWithCamera(world, matrices);
  });
  if (points.some(point => !point)) return;
  const xs = points.map(point => (point!.x + 1) * width / 2), ys = points.map(point => (1 - point!.y) * height / 2);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}
