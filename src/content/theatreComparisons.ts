import type { Vec3 } from '../domain/firstPerson/types';
import { AMES_FACES, AMES_OBSERVATION_POINTS, AMES_PROP_PARTS, AMES_PROPS, AMES_VERTICES, amesWorldPoint } from '../domain/theatre/perspectiveExhibit';
import { COAT_OUTLINE, evaluateLight, LIGHT_RECEIVER, LIGHT_WINDOWS, lightSource } from '../domain/theatre/lightGate';
import { parseHex } from '../domain/emblem/color';
import type { ComparisonRaster } from './illusionComparisons';
type Point = { x: number; y: number };
type Polygon = { id: string; points: readonly Point[]; color: string };
type Line = { id: string; a: Point; b: Point; color: string; width: number };
export type TheatreComparisonState = { rail: number; view: keyof typeof AMES_OBSERVATION_POINTS };
export type TheatreComparisonGeometry = { width: number; height: number; polygons: Polygon[]; lines: Line[] };
export function theatreComparisonGeometry(kind: 'shadow' | 'depth', state: TheatreComparisonState): TheatreComparisonGeometry {
  const width = 320, height = kind === 'shadow' ? 380 : 240, polygons: Polygon[] = [], lines: Line[] = [];
  const line = (id: string, a: Point, b: Point, color = '#594F42', stroke = 1.5) => lines.push({ id, a, b, color, width: stroke });
  const outline = (id: string, points: readonly Point[], color?: string) => points.forEach((p, i) => line(id + '-' + i, p, points[(i + 1) % points.length]!, color));
  if (kind === 'shadow') {
    const bounds = LIGHT_RECEIVER.bounds;
    const receiver = (p: Point): Point => ({ x: (p.x - bounds.minX) / (bounds.maxX - bounds.minX) * 300 + 10, y: (bounds.maxY - p.y) / (bounds.maxY - bounds.minY) * 225 + 5 });
    evaluateLight(state.rail).polygons.forEach((points, i) => polygons.push({ id: 'physical-shadow-' + i, points: points.map(receiver), color: '#30312C' }));
    LIGHT_WINDOWS.forEach(w => outline('receiver-' + w.id, [
      { x: w.minX, y: w.minY }, { x: w.maxX, y: w.minY }, { x: w.maxX, y: w.maxY }, { x: w.minX, y: w.maxY },
    ].map(receiver), '#87642B'));
    outline('receiver-plane', [{ x: 10, y: 5 }, { x: 310, y: 5 }, { x: 310, y: 230 }, { x: 10, y: 230 }]);
    // Plan-view rays use the exact same source and static occluder plane. This
    // explanatory view changes neither physical object nor committed progress.
    const plan = (p: Vec3): Point => ({ x: 160 + p.x * 48, y: 370 - (p.z + 1.2) * 16 });
    const source = lightSource(state.rail), center = plan(source), minX = Math.min(...COAT_OUTLINE.map(p => p.x)), maxX = Math.max(...COAT_OUTLINE.map(p => p.x));
    for (const x of [minX, maxX]) {
      const t = (6 - source.z) / (2 - source.z), end = { x: source.x + t * (x - source.x), y: 0, z: 6 };
      line('ray-' + x, center, plan(end), '#9C7B42', 1);
    }
    line('static-coat-plan', plan({ x: minX, y: 0, z: 2 }), plan({ x: maxX, y: 0, z: 2 }), '#30312C', 5);
    line('receiving-plane-plan', plan({ x: -2.4, y: 0, z: 6 }), plan({ x: 2.4, y: 0, z: 6 }), '#594F42', 3);
    line('physical-source', { x: center.x - 4, y: center.y }, { x: center.x + 4, y: center.y }, '#9B610F', 8);
  } else {
    const camera = AMES_OBSERVATION_POINTS[state.view], tangent = Math.tan(65 * Math.PI / 360), aspect = width / height;
    const project = (world: Vec3): Point => {
      const dx = world.x - camera.position.x, dy = world.y - camera.position.y, dz = world.z - camera.position.z;
      const sx = Math.cos(camera.yaw) * dx - Math.sin(camera.yaw) * dz;
      const yawDepth = -Math.sin(camera.yaw) * dx - Math.cos(camera.yaw) * dz;
      // Inverse of the gameplay camera's YXZ yaw/pitch rotation. Keep the
      // authored observation pose, including the side view's downward pitch.
      const sy = Math.cos(camera.pitch) * dy - Math.sin(camera.pitch) * yawDepth;
      const depth = Math.sin(camera.pitch) * dy + Math.cos(camera.pitch) * yawDepth;
      return depth > .08 ? { x: (sx / (depth * tangent * aspect) + 1) * width / 2, y: (1 - sy / (depth * tangent)) * height / 2 } : { x: -10000, y: -10000 };
    };
    const room = AMES_VERTICES.map(p => project(amesWorldPoint(p)));
    AMES_FACES.forEach(face => outline('fixed-room-' + face.id, face.indices.map(index => room[index]!)));
    // Identical cuboids use their actual world dimensions, position and scale.
    AMES_PROPS.forEach(prop => {
      const p = prop.position;
      AMES_PROP_PARTS.forEach((part, partIndex) => {
      const vertices = [0, 1, 2, 3, 4, 5, 6, 7].map(i => project({ x: p.x + (i & 1 ? .5 : -.5) * part.width, y: p.y + part.centerY + (i & 2 ? .5 : -.5) * part.height, z: p.z + (i & 4 ? .5 : -.5) * part.depth }));
      for (const [index, face] of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]].entries()) {
        polygons.push({ id: prop.id + '-' + partIndex + '-face-' + index, points: face.map(i => vertices[i]!), color: '#586D68' });
        outline(prop.id + '-' + partIndex + '-edge-' + index, face.map(i => vertices[i]!), '#D6DBCA');
      }
      });
    });
  }
  return { width, height, polygons, lines };
}
function inside(p: Point, polygon: readonly Point[]): boolean {
  let value = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) value = !value;
  }
  return value;
}
export function theatreComparison(kind: 'shadow' | 'depth', state: TheatreComparisonState): ComparisonRaster {
  const geometry = theatreComparisonGeometry(kind, state), { width, height } = geometry, rgba = new Uint8Array(width * height * 4);
  const colors = new Map<string, readonly number[]>();
  const rgb = (hex: string) => { if (!colors.has(hex)) colors.set(hex, parseHex(hex)); return colors.get(hex)!; };
  const paint = (x: number, y: number, color: readonly number[]) => rgba.set([...color, 255], (y * width + x) * 4);
  const background = rgb('#C8C5B5');
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) paint(x, y, background);
  // Rasterize only bounded primitive rectangles. Comparison controls must not
  // traverse every shape for every pixel on the JavaScript UI thread.
  const bounds = (points: readonly Point[], pad = 0) => ({
    left: Math.max(0, Math.floor(Math.min(...points.map(p => p.x)) - pad)),
    right: Math.min(width - 1, Math.ceil(Math.max(...points.map(p => p.x)) + pad)),
    top: Math.max(0, Math.floor(Math.min(...points.map(p => p.y)) - pad)),
    bottom: Math.min(height - 1, Math.ceil(Math.max(...points.map(p => p.y)) + pad)),
  });
  for (const polygon of geometry.polygons) {
    if (polygon.points.length < 3) continue;
    const b = bounds(polygon.points), color = rgb(polygon.color);
    for (let y = b.top; y <= b.bottom; y++) for (let x = b.left; x <= b.right; x++) if (inside({ x: x + .5, y: y + .5 }, polygon.points)) paint(x, y, color);
  }
  for (const line of geometry.lines) {
    const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y, length = dx * dx + dy * dy;
    const b = bounds([line.a, line.b], line.width / 2), color = rgb(line.color), radiusSquared = line.width * line.width / 4;
    for (let y = b.top; y <= b.bottom; y++) for (let x = b.left; x <= b.right; x++) {
      const px = x + .5, py = y + .5, t = length ? Math.max(0, Math.min(1, ((px - line.a.x) * dx + (py - line.a.y) * dy) / length)) : 0;
      const ex = px - line.a.x - t * dx, ey = py - line.a.y - t * dy;
      if (ex * ex + ey * ey <= radiusSquared) paint(x, y, color);
    }
  }
  return { width, height, rgba };
}
