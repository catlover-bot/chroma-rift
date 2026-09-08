import { parseHex } from '../domain/emblem/color';
import { createPanelFixture } from '../domain/firstPerson/panelFixture';
import { VAULT_LENGTH_FIXTURE, VAULT_ROD_FIXTURE } from '../domain/vault/definition';
import { CAFE_SPEC, LENGTH_SPEC, ROD_SPEC, finSegments, rodEndpoints, rodTargetAngle, shaftEndpoints } from '../domain/vault/specs';
import type { VaultDiscovery, VaultProgress } from '../domain/vault/types';
import type { ComparisonRaster } from './illusionComparisons';
export type VaultComparisons = { length: number; angle: number; aids: VaultProgress['aids'] };
export function createVaultComparisons(progress: VaultProgress): VaultComparisons {
  return { length: progress.length.length, angle: progress.rod.angle, aids: { ...progress.aids } };
}
type Point = { x: number; y: number };
type Line = { id: string; from: Point; to: Point; width: number; color: string };
type Tile = { id: string; x: number; y: number; width: number; height: number; color: string };
/** Frontal explanatory views use the same authored endpoints, fin segments,
 * independent frame angle and tile coordinates as the physical devices. */
export function vaultComparisonPrimitives(kind: VaultDiscovery, state: VaultComparisons) {
  const lines: Line[] = [], tiles: Tile[] = [], ink = '#303B38', guide = '#776340';
  const line = (id: string, from: Point, to: Point, width: number, color = ink) => lines.push({ id, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, width, color });
  if (kind === 'length') {
    for (const reference of [true, false]) {
      const length = reference ? LENGTH_SPEC.targetLength : state.length, ends = shaftEndpoints(length, reference), name = reference ? 'reference' : 'variable';
      line(name + '-shaft', ends[0], ends[1], LENGTH_SPEC.shaftWidth);
      if (!state.aids.finsHidden) finSegments(length, reference).forEach((segment, i) => line(name + '-fin-' + i, segment.from, segment.to, LENGTH_SPEC.shaftWidth));
    }
    if (state.aids.lengthGuide) [LENGTH_SPEC.left, LENGTH_SPEC.left + LENGTH_SPEC.targetLength].forEach((x, i) => line('measurement-guide-' + i, { x, y: -.525 }, { x, y: .525 }, .012, guide));
  } else if (kind === 'rod') {
    const ends = rodEndpoints(state.angle); line('rod-shaft', ends[0], ends[1], .035);
    if (!state.aids.frameHidden) {
      const half = ROD_SPEC.frameSize / 2, cos = Math.cos(ROD_SPEC.frameAngle), sin = Math.sin(ROD_SPEC.frameAngle);
      const points = [[-half, -half], [-half, half], [half, half], [half, -half]].map(([x, y]) => ({ x: x! * cos + y! * sin, y: -x! * sin + y! * cos }));
      points.forEach((point, i) => line('tilted-frame-' + i, point, points[(i + 1) % 4]!, .025));
    }
    // The authored board is vertical; this separate reference follows gravity,
    // not the tilted frame. It never changes the rod's angle.
    if (state.aids.plumb) {
      const fixture = createPanelFixture(VAULT_ROD_FIXTURE), target = rodTargetAngle(fixture.right, fixture.up);
      const x = Math.sin(target) * .675, y = Math.cos(target) * .675;
      line('plumb', { x: -.74 - x, y: -y }, { x: -.74 + x, y }, .012, guide);
    }
  } else {
    const h = (CAFE_SPEC.height - CAFE_SPEC.mortarWidth * (CAFE_SPEC.rows - 1)) / CAFE_SPEC.rows;
    for (let row = 0; row < CAFE_SPEC.rows; row++) for (let col = 0; col < 8; col++) {
      const shift = row % 2 * CAFE_SPEC.rowOffset;
      const left = Math.max(-CAFE_SPEC.width / 2, -CAFE_SPEC.width / 2 + (col - 1) * CAFE_SPEC.tileWidth + shift);
      const right = Math.min(CAFE_SPEC.width / 2, -CAFE_SPEC.width / 2 + col * CAFE_SPEC.tileWidth + shift);
      if (right > left) tiles.push({ id: row + '-' + col, x: (left + right) / 2, y: CAFE_SPEC.height / 2 - h / 2 - row * (h + CAFE_SPEC.mortarWidth),
        width: right - left, height: h, color: state.aids.cafeNeutral ? CAFE_SPEC.light : col % 2 === 0 ? CAFE_SPEC.dark : CAFE_SPEC.light });
    }
  }
  const width = kind === 'length' ? VAULT_LENGTH_FIXTURE.width : kind === 'rod' ? VAULT_ROD_FIXTURE.width : CAFE_SPEC.width;
  const height = kind === 'length' ? VAULT_LENGTH_FIXTURE.height : kind === 'rod' ? VAULT_ROD_FIXTURE.height : CAFE_SPEC.height;
  return { width, height, background: kind === 'cafe' ? CAFE_SPEC.mortar : '#B9B7A7', lines, tiles };
}
function onSegment(x: number, y: number, line: Line): boolean {
  const dx = line.to.x - line.from.x, dy = line.to.y - line.from.y, length = dx * dx + dy * dy;
  const t = ((x - line.from.x) * dx + (y - line.from.y) * dy) / length;
  return t >= 0 && t <= 1 && Math.hypot(x - line.from.x - t * dx, y - line.from.y - t * dy) <= line.width / 2;
}
export function vaultComparison(kind: VaultDiscovery, state: VaultComparisons): ComparisonRaster {
  const primitives = vaultComparisonPrimitives(kind, state), width = 320, height = Math.round(width * primitives.height / primitives.width), rgba = new Uint8Array(width * height * 4);
  const colors = new Map<string, readonly number[]>();
  const color = (hex: string) => { if (!colors.has(hex)) colors.set(hex, parseHex(hex)); return colors.get(hex)!; };
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const x = ((col + .5) / width - .5) * primitives.width, y = (.5 - (row + .5) / height) * primitives.height;
    let hex = primitives.background;
    primitives.tiles.forEach(tile => { if (Math.abs(x - tile.x) <= tile.width / 2 && Math.abs(y - tile.y) <= tile.height / 2) hex = tile.color; });
    primitives.lines.forEach(line => { if (onSegment(x, y, line)) hex = line.color; });
    rgba.set([...color(hex), 255], (row * width + col) * 4);
  }
  return { width, height, rgba };
}
