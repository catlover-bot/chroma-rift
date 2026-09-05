import type { Point } from '../domain/illusion';

export type ExplorerFacing = -1 | 1;

/** An idle or vertical path retains the last deliberate horizontal direction. */
export function travelFacing(points: readonly Point[], previous: ExplorerFacing): ExplorerFacing {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || Math.abs(last.x - first.x) < 0.01) return previous;
  return last.x < first.x ? -1 : 1;
}
