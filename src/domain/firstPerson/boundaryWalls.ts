import type { CollisionVolume, FloorRegion } from './types';

export function box(id: string, minX: number, maxX: number, minZ: number, maxZ: number, kind: CollisionVolume['kind'] = 'wall', minY = 0, maxY = 3.2): CollisionVolume {
  return { id, min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, kind, opaque: true };
}

// Small integer-grid room union: merge exposed boundary edges into long walls.
// This only constructs the authored chapter, not a maze generator or scene editor.
export function boundaryWalls(floors: readonly FloorRegion[], omitRememberedSeam = true): CollisionVolume[] {
  const cells = new Set<string>();
  for (const floor of floors) for (let x = floor.minX; x < floor.maxX; x += 1) for (let z = floor.minZ; z < floor.maxZ; z += 1) cells.add(`${x},${z}`);
  const lines = new Map<string, number[]>();
  const add = (axis: 'x' | 'z', fixed: number, start: number) => {
    const key = `${axis}:${fixed}`;
    const values = lines.get(key) ?? [];
    values.push(start); lines.set(key, values);
  };
  for (const cell of cells) {
    const [x, z] = cell.split(',').map(Number) as [number, number];
    if (!cells.has(`${x - 1},${z}`)) add('x', x, z);
    if (!cells.has(`${x + 1},${z}`)) add('x', x + 1, z);
    if (!cells.has(`${x},${z - 1}`)) add('z', z, x);
    if (!cells.has(`${x},${z + 1}`)) add('z', z + 1, x);
  }
  const walls: CollisionVolume[] = [];
  for (const [line, values] of lines) {
    const [axis, fixedText] = line.split(':');
    const fixed = Number(fixedText);
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length;) {
      const start = sorted[i]!;
      let end = start + 1;
      i += 1;
      while (sorted[i] === end) { end += 1; i += 1; }
      // The remembered doorway partition below owns the seam at z=6.
      if (omitRememberedSeam && axis === 'z' && fixed === 6) continue;
      const id = `boundary-${axis}-${fixed}-${start}-${end}`;
      walls.push(axis === 'x' ? box(id, fixed - 0.1, fixed + 0.1, start, end) : box(id, start, end, fixed - 0.1, fixed + 0.1));
    }
  }
  return walls;
}
