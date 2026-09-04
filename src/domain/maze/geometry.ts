import type { Point, RailPath } from './types';

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  const closestX = start.x + projection * dx;
  const closestY = start.y + projection * dy;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

export function distanceToRail(point: Point, rail: RailPath): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < rail.points.length - 1; index += 1) {
    const start = rail.points[index];
    const end = rail.points[index + 1];
    if (start && end) nearest = Math.min(nearest, distanceToSegment(point, start, end));
  }
  return nearest;
}

export function findNearestEligibleRail(
  point: Point,
  rails: readonly RailPath[],
  hitRadius = 28,
): RailPath | undefined {
  let nearest: RailPath | undefined;
  let nearestDistance = hitRadius;
  for (const rail of rails) {
    const distance = distanceToRail(point, rail);
    if (distance <= nearestDistance) {
      nearest = rail;
      nearestDistance = distance;
    }
  }
  return nearest;
}
