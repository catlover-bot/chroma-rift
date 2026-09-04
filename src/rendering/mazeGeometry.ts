import type { Point, RailPath } from '../domain/maze/types';

export type MazeGeometry = {
  rails: RailPath[];
  entries: readonly [Point, Point, Point];
  goal: Point;
};

export function buildMazeGeometry(width: number, height: number): MazeGeometry {
  const centerX = width / 2;
  const top = 54;
  const bottom = height - 44;
  const step = (bottom - top) / 3;
  const entries = [0, 1, 2].map((index) => ({ x: centerX, y: top + index * step })) as [
    Point,
    Point,
    Point,
  ];
  const goal = { x: centerX, y: bottom };
  const branch = Math.min(width * 0.29, 112);
  const rails: RailPath[] = [];

  entries.forEach((entry, junctionIndex) => {
    const exit = entries[junctionIndex + 1] ?? goal;
    const redDirection = junctionIndex % 2 === 0 ? -1 : 1;
    rails.push(
      {
        id: `junction-${junctionIndex}-red`,
        junctionIndex,
        color: 'red',
        points: [entry, { x: centerX + redDirection * branch, y: entry.y + step * 0.48 }, exit],
      },
      {
        id: `junction-${junctionIndex}-blue`,
        junctionIndex,
        color: 'blue',
        points: [entry, { x: centerX - redDirection * branch, y: entry.y + step * 0.48 }, exit],
      },
    );
  });

  return { rails, entries, goal };
}

export function pointAlongRail(points: readonly Point[], progress: number): Point {
  'worklet';
  const start = points[0] ?? { x: 0, y: 0 };
  const middle = points[1] ?? start;
  const end = points[2] ?? middle;
  if (progress <= 0.5) {
    const local = progress * 2;
    return { x: start.x + (middle.x - start.x) * local, y: start.y + (middle.y - start.y) * local };
  }
  const local = (progress - 0.5) * 2;
  return { x: middle.x + (end.x - middle.x) * local, y: middle.y + (end.y - middle.y) * local };
}
