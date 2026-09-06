import { angularDifference, createContourSpec, createShadowSpec, getWiringSpec, SHADOW_SAMPLE_SIZE, type DiscAngles } from '../domain/gallery';
import { parseHex, type PaletteId } from '../domain/emblem';
import { rasterizeChromaticExhibit } from '../rendering/firstPerson/chromaticExhibit';

export type ComparisonRaster = { width: number; height: number; rgba: Uint8Array };
const distance = (x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
};
export function chromaticComparison(neutral: boolean, palette: PaletteId): ComparisonRaster {
  return rasterizeChromaticExhibit(256, neutral, palette);
}
/** Lightweight note figures consume the same authored geometry and colors.
 * They have no controller, progression writer, actor, or renderer owner. */
export function diagramComparison(kind: 'shadow' | 'contour' | 'wiring', options: { seed: number; neutral: boolean; rotation: number; guide: boolean; offset: number; cover: number }): ComparisonRaster {
  const width = 320, height = 240, rgba = new Uint8Array(width * height * 4);
  const shadow = createShadowSpec(options.seed), contour = createContourSpec(options.seed), wiring = getWiringSpec(options);
  const angles = contour.discs.map(disc => disc.targetAngle + options.rotation) as DiscAngles;
  const colors = new Map<string, readonly number[]>();
  const color = (hex: string) => { if (!colors.has(hex)) colors.set(hex, parseHex(hex)); return colors.get(hex)!; };
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const x = ((col + .5) / width - .5) * 2.4, y = (.5 - (row + .5) / height) * 1.8;
    let hex = kind === 'shadow' ? '#707070' : '#E8E4D8';
    if (kind === 'shadow') {
      shadow.contexts.forEach(context => { if (Math.abs(x - context.x) <= context.width / 2 && Math.abs(y - context.y) <= context.height / 2) hex = options.neutral ? '#707070' : context.color; });
      shadow.samples.forEach(sample => { const center = shadow.slots[sample.sourceSlot]; if (Math.abs(x - center.x) <= SHADOW_SAMPLE_SIZE / 2 && Math.abs(y - center.y) <= SHADOW_SAMPLE_SIZE / 2) hex = sample.color; });
    } else if (kind === 'contour') {
      if (contour.discs.some(disc => Math.hypot(x - disc.center.x, y - disc.center.y) <= disc.radius && angularDifference(Math.atan2(y - disc.center.y, x - disc.center.x), angles[disc.id]) >= disc.wedgeAngle / 2)) hex = contour.ink;
      if (options.guide) contour.guide.points.forEach((a, i) => { const b = contour.guide.points[(i + 1) % 3]!;
        const along = Math.hypot(x - a.x, y - a.y); if (distance(x, y, a, b) < .011 && Math.floor(along / .045) % 2 === 0) hex = '#A24D33'; });
    } else {
      if (distance(x, y, wiring.fixedLine[0], wiring.fixedLine[1]) < .018 || distance(x, y, wiring.movableLine[0], wiring.movableLine[1]) < .018) hex = '#303537';
      if (Math.abs(x - wiring.cover.center.x) <= wiring.cover.width / 2 && Math.abs(y) <= wiring.cover.height / 2) hex = '#878C8A';
    }
    const index = (row * width + col) * 4; rgba.set([...color(hex), 255], index);
  }
  return { width, height, rgba };
}
