/** Both orientations stop the same distance from every crossing center. */
export function segmentsWithSymmetricGaps(start: number, end: number, crossings: number[], halfGap: number): [number, number][] {
  const result: [number, number][] = [];
  let cursor = start;
  for (const crossing of [...crossings].sort((a, b) => a - b)) {
    if (crossing + halfGap <= start || crossing - halfGap >= end) continue;
    const gapStart = Math.max(start, crossing - halfGap);
    if (cursor < gapStart) result.push([cursor, gapStart]);
    cursor = Math.max(cursor, Math.min(end, crossing + halfGap));
  }
  if (cursor < end) result.push([cursor, end]);
  return result;
}
