import type { CameraId, CameraPose, FloorNode, LevelDefinition, Point, ProjectedFace, ProjectedLevel, Vec3 } from './types';

// Orthographic 2.5D: world Y is up. Larger depth is nearer the camera.
// The discrete matrices are also the mathematical contract for special bridges.
export const CAMERAS: Readonly<Record<CameraId, CameraPose>> = {
  a: { id: 'a', horizontal: { x: 0.8, y: 0, z: -0.8 }, vertical: { x: 0.42, y: -1, z: 0.42 }, depth: { x: 0.42, y: 1, z: 0.42 } },
  b: { id: 'b', horizontal: { x: 0.8, y: 0, z: 0.8 }, vertical: { x: -0.42, y: -1, z: 0.42 }, depth: { x: -0.42, y: 1, z: 0.42 } },
};
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export function projectPoint(point: Vec3, camera: CameraId): Point {
  return { x: dot(point, CAMERAS[camera].horizontal), y: dot(point, CAMERAS[camera].vertical) };
}
export function worldDepth(point: Vec3, camera: CameraId): number {
  return dot(point, CAMERAS[camera].depth);
}
export function projectWorld(point: Vec3, camera: CameraId, projection: Pick<ProjectedLevel, 'scale' | 'offset'>): Point {
  const p = projectPoint(point, camera);
  return { x: p.x * projection.scale + projection.offset.x, y: p.y * projection.scale + projection.offset.y };
}

type WorldFace = Omit<ProjectedFace, 'points' | 'depth' | 'vertexDepths'> & { points: Vec3[] };
type Solid = { xMin: number; xMax: number; zMin: number; zMax: number; top: number; bottom: number };
export type StairEntry = { lower: FloorNode; axis: 'x' | 'z'; sign: number };
export function stairEntry(level: LevelDefinition, node: FloorNode): StairEntry | undefined {
  for (const edge of level.edges) {
    if (edge.kind !== 'stairs' || (edge.from !== node.id && edge.to !== node.id)) continue;
    const lower = level.nodes.find((candidate) => candidate.id === (edge.from === node.id ? edge.to : edge.from));
    if (!lower || lower.position.y >= node.position.y) continue;
    const dx = lower.position.x - node.position.x;
    const dz = lower.position.z - node.position.z;
    const axis = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z';
    return { lower, axis, sign: Math.sign(axis === 'x' ? dx : dz) };
  }
  return undefined;
}

function solidsForNode(level: LevelDefinition, node: FloorNode): Solid[] {
  const { x, y, z } = node.position;
  const half = node.size / 2;
  const base: Solid = { xMin: x - half, xMax: x + half, zMin: z - half, zMax: z + half, top: y, bottom: y - node.thickness };
  const entry = stairEntry(level, node);
  if (!entry) return [base];
  const low = entry.lower.position.y;
  const center = node.position[entry.axis];
  const solids: Solid[] = [];
  // Four physical treads on the entry half, then a level landing at the node center.
  for (let i = 0; i < 5; i += 1) {
    const start = i < 4 ? center + entry.sign * half * (1 - i / 4) : center;
    const end = i < 4 ? center + entry.sign * half * (1 - (i + 1) / 4) : center - entry.sign * half;
    solids.push({ ...base,
      [`${entry.axis}Min`]: Math.min(start, end), [`${entry.axis}Max`]: Math.max(start, end),
      top: i < 4 ? low + (y - low) * (i + 1) / 4 : y,
      bottom: low - node.thickness,
    });
  }
  return solids;
}

function worldFaces(level: LevelDefinition, camera: CameraId): WorldFace[] {
  const faces: WorldFace[] = [];
  for (const node of level.nodes) {
    solidsForNode(level, node).forEach((solid, index) => {
      const { xMin: a, xMax: b, zMin: c, zMax: d, top: y, bottom: q } = solid;
      const add = (kind: 'top' | 'side', shade: ProjectedFace['shade'], points: Vec3[]) => {
        faces.push({ id: `${node.id}-${index}-${shade}`, nodeId: node.id, kind, shade, points });
      };
      add('top', 'top', [{ x: a, y, z: c }, { x: b, y, z: c }, { x: b, y, z: d }, { x: a, y, z: d }]);
      // Cull faces whose normals point away from the selected fixed camera.
      const x = camera === 'a' ? b : a;
      add('side', camera === 'a' ? 'right' : 'left', [{ x, y, z: c }, { x, y: q, z: c }, { x, y: q, z: d }, { x, y, z: d }]);
      add('side', camera === 'a' ? 'left' : 'right', [{ x: a, y, z: d }, { x: a, y: q, z: d }, { x: b, y: q, z: d }, { x: b, y, z: d }]);
    });
  }
  return faces;
}

function centroid(points: readonly Point[]): Point {
  return { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
}
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < 0.00001 && point.x >= Math.min(a.x, b.x) - 0.00001 && point.x <= Math.max(a.x, b.x) + 0.00001 && point.y >= Math.min(a.y, b.y) - 0.00001 && point.y <= Math.max(a.y, b.y) + 0.00001) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function frontFace(point: Point, faces: readonly ProjectedFace[]): ProjectedFace | undefined {
  for (let i = faces.length - 1; i >= 0; i -= 1) {
    const face = faces[i]!;
    if (pointInPolygon(point, face.points)) return face;
  }
  return undefined;
}
function probes(face: ProjectedFace): Point[] {
  const center = centroid(face.points);
  return [center, ...face.points.map((p) => ({ x: center.x + (p.x - center.x) * 0.85, y: center.y + (p.y - center.y) * 0.85 }))];
}

function signedArea(polygon: readonly Point[]): number {
  return polygon.reduce((sum, p, i) => {
    const next = polygon[(i + 1) % polygon.length]!;
    return sum + p.x * next.y - next.x * p.y;
  }, 0) / 2;
}
/** Convex face intersection, used only for the few authored rectangular solids. */
export function overlapPolygon(first: readonly Point[], second: readonly Point[]): Point[] {
  let result = [...first];
  const orientation = Math.sign(signedArea(second));
  for (let i = 0; i < second.length && result.length; i += 1) {
    const a = second[i]!;
    const b = second[(i + 1) % second.length]!;
    const side = (p: Point) => orientation * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const input = result;
    result = [];
    for (let j = 0; j < input.length; j += 1) {
      const p = input[j]!;
      const q = input[(j + 1) % input.length]!;
      const sp = side(p);
      const sq = side(q);
      if (sp >= -0.000001) result.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        result.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return Math.abs(signedArea(result)) > 0.00001 ? result : [];
}

export function depthAtFace(face: ProjectedFace, point: Point): number {
  const origin = face.points[0]!;
  const horizontal = face.points[1]!;
  const vertical = face.points[3]!;
  const ux = horizontal.x - origin.x;
  const uy = horizontal.y - origin.y;
  const vx = vertical.x - origin.x;
  const vy = vertical.y - origin.y;
  const determinant = ux * vy - uy * vx;
  if (Math.abs(determinant) < 0.000001) return face.depth;
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  const u = (x * vy - y * vx) / determinant;
  const v = (ux * y - uy * x) / determinant;
  const depth = face.vertexDepths[0]!;
  return depth + u * (face.vertexDepths[1]! - depth) + v * (face.vertexDepths[3]! - depth);
}

function painterOrder(faces: ProjectedFace[]): { faces: ProjectedFace[]; fallbacks: string[] } {
  // Centroids only break ties between faces that do not overlap. For overlapping
  // faces compare depths on the SAME view ray, then topologically order them.
  // These two levels contain no cyclic/interpenetrating surfaces; tests audit it.
  const ordered = [...faces].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  const followers = ordered.map(() => new Set<number>());
  const indegree = ordered.map(() => 0);
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const overlap = overlapPolygon(ordered[i]!.points, ordered[j]!.points);
      if (!overlap.length) continue;
      const point = centroid(overlap);
      const difference = depthAtFace(ordered[i]!, point) - depthAtFace(ordered[j]!, point);
      if (Math.abs(difference) < 0.00001) continue;
      const far = difference < 0 ? i : j;
      const near = difference < 0 ? j : i;
      followers[far]!.add(near);
      indegree[near]! += 1;
    }
  }
  const result: ProjectedFace[] = [];
  const fallbacks: string[] = [];
  const emitted = new Set<number>();
  while (result.length < ordered.length) {
    let next = indegree.findIndex((degree, index) => degree === 0 && !emitted.has(index));
    // Deterministic fallback for malformed future geometry. Authored levels must
    // pass the pairwise overlap audit; this is not an arbitrary scene renderer.
    if (next < 0) {
      next = ordered.findIndex((_, index) => !emitted.has(index));
      fallbacks.push(ordered[next]!.id);
    }
    emitted.add(next);
    result.push(ordered[next]!);
    for (const follower of followers[next]!) indegree[follower]! -= 1;
  }
  return { faces: result, fallbacks };
}

export function projectLevel(level: LevelDefinition, camera: CameraId, width: number, height: number): ProjectedLevel {
  const world = worldFaces(level, camera);
  const raw = world.flatMap((face) => face.points.map((p) => projectPoint(p, camera)));
  const minX = Math.min(...raw.map((p) => p.x));
  const maxX = Math.max(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y)) - 0.7; // character head room
  const maxY = Math.max(...raw.map((p) => p.y)) + 0.25;
  const scale = Math.max(0.001, Math.min(Math.max(1, width - 24) / (maxX - minX), Math.max(1, height - 36) / (maxY - minY)));
  const offset = { x: (width - (maxX + minX) * scale) / 2, y: (height - (maxY + minY) * scale) / 2 };
  const projection = { scale, offset };
  const ordered = painterOrder(world.map((face): ProjectedFace => ({ ...face,
    points: face.points.map((p) => projectWorld(p, camera, projection)),
    vertexDepths: face.points.map((p) => worldDepth(p, camera)),
    depth: face.points.reduce((sum, p) => sum + worldDepth(p, camera), 0) / face.points.length,
  })));
  const faces = ordered.faces;
  const floors = level.nodes.map((node) => {
    const tops = faces.filter((face) => face.nodeId === node.id && face.kind === 'top');
    const half = node.size / 2;
    return {
      nodeId: node.id, center: projectWorld(node.position, camera, projection), depth: worldDepth(node.position, camera),
      polygon: [{ x: -half, z: -half }, { x: half, z: -half }, { x: half, z: half }, { x: -half, z: half }].map((p) => projectWorld({ x: node.position.x + p.x, y: node.position.y, z: node.position.z + p.z }, camera, projection)),
      visible: tops.some((face) => probes(face).some((p) => frontFace(p, faces)?.nodeId === node.id && frontFace(p, faces)?.kind === 'top')),
    };
  });
  return { width, height, scale, offset, faces, floors, occlusionFallbacks: ordered.fallbacks };
}

export function hitTestFloor(point: Point, projection: ProjectedLevel, eligibleIds?: readonly string[], minTapSize = 44): string | undefined {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > projection.width || point.y > projection.height) return undefined;
  const eligible = (id: string) => !eligibleIds || eligibleIds.includes(id);
  const direct = frontFace(point, projection.faces);
  // Never tunnel a tap through an ineligible foreground floor or a solid side.
  if (direct) return direct.kind === 'top' && eligible(direct.nodeId) ? direct.nodeId : undefined;
  const candidates: { id: string; distance: number; depth: number }[] = [];
  for (const floor of projection.floors) {
    if (!floor.visible || !eligible(floor.nodeId)) continue;
    for (const face of projection.faces.filter((f) => f.nodeId === floor.nodeId && f.kind === 'top')) {
      for (const p of probes(face)) {
        const visible = frontFace(p, projection.faces);
        const distance = Math.hypot(point.x - p.x, point.y - p.y);
        if (visible?.nodeId === floor.nodeId && visible.kind === 'top' && distance <= minTapSize / 2) candidates.push({ id: floor.nodeId, distance, depth: floor.depth });
      }
    }
  }
  // Expanded targets on blank space: nearest visible sample; ties go to front,
  // then stable node ID. Actual drawn surfaces always win before expansion.
  return candidates.sort((a, b) => a.distance - b.distance || b.depth - a.depth || a.id.localeCompare(b.id))[0]?.id;
}

/** Linear sRGB -> Rec.709 luminance -> sRGB gray; not a display calibration. */
export function neutralizeColor(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const linear = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const r = linear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = linear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = linear(parseInt(hex.slice(5, 7), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const encoded = luminance <= 0.0031308 ? 12.92 * luminance : 1.055 * luminance ** (1 / 2.4) - 0.055;
  const gray = Math.round(encoded * 255).toString(16).padStart(2, '0');
  return `#${gray}${gray}${gray}`;
}
