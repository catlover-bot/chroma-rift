import { PALETTES, parseHex, sampleColor, type PaletteId, type Presentation } from './color';

export const STIMULUS_VERSION = 1;
export const GLYPHS = ['circle', 'diamond', 'square'] as const;
export type Glyph = typeof GLYPHS[number];
export type Preference = 'red' | 'blue' | 'unknown';
export type Point = Readonly<{ x: number; y: number }>;
export type SealPath = Readonly<{ role: 'continuous' | 'broken'; glyph: Glyph; width: number; points: readonly Point[] }>;
export type SealStimulus = Readonly<{ version: typeof STIMULUS_VERSION; seed: number; paletteId: PaletteId; preference: Preference; answer: Glyph; distractor: Glyph; paths: readonly SealPath[]; geometryKey: string }>;
export type SealCoverage = { size: number; geometryKey: string; continuous: Uint8Array; broken: Uint8Array };
export type SealRaster = { width: number; height: number; rgba: Uint8Array; geometryKey: string; presentation: Presentation };
function seedStep(x: number): number {
  let n = x >>> 0;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  return n >>> 0;
}
function point(glyph: Glyph, t: number, radius: number, phase: number): Point {
  const angle = 2 * Math.PI * t;
  let x: number, y: number;
  if (glyph === 'circle') { x = Math.cos(angle); y = Math.sin(angle); }
  else {
    const vertices = glyph === 'diamond' ? [[0, -1], [1, 0], [0, 1], [-1, 0]] : [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const q = ((t + phase) % 1 + 1) % 1 * 4;
    const i = Math.floor(q), f = q - i;
    const a = vertices[i]!, b = vertices[(i + 1) % 4]!;
    x = a[0]! * (1 - f) + b[0]! * f;
    y = a[1]! * (1 - f) + b[1]! * f;
    if (glyph === 'square') { x *= 0.88; y *= 0.88; }
  }
  return Object.freeze({ x: 0.5 + x * radius, y: 0.5 + y * radius });
}
/** Original supplied contours: intentional shape cues, on ONE plane. */
export function createSealStimulus(seed: number, paletteId: PaletteId = 'baseline', preference: Preference = 'unknown'): SealStimulus {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed must be uint32.');
  if (!Object.hasOwn(PALETTES, paletteId)) throw new RangeError('Unknown palette.');
  if (!['red', 'blue', 'unknown'].includes(preference)) throw new RangeError('Unknown preference.');
  const a = seedStep(seed || 0x6d2b79f5), b = seedStep(a), c = seedStep(b);
  const answer = GLYPHS[a % 3]!;
  const distractor = GLYPHS[(a % 3 + 1 + b % 2) % 3]!;
  const continuousOuter = c % 2 === 0;
  const outer = 0.375, inner = 0.175, samples = 96, phase = 0;
  const closed = Array.from({ length: samples + 1 }, (_, i) => point(answer, i / samples, continuousOuter ? outer : inner, phase));
  const gapStart = [0.04, 0.29, 0.54, 0.79][b % 4]!, gapLength = 0.13;
  const open = Array.from({ length: samples + 1 }, (_, i) => point(distractor, (gapStart + gapLength + i / samples * (1 - gapLength)) % 1, continuousOuter ? inner : outer, phase));
  const paths: readonly SealPath[] = Object.freeze([
    Object.freeze({ role: 'continuous', glyph: answer, width: 0.017, points: Object.freeze(closed) }),
    Object.freeze({ role: 'broken', glyph: distractor, width: 0.017, points: Object.freeze(open) }),
  ]);
  return Object.freeze({ version: STIMULUS_VERSION, seed, paletteId, preference, answer, distractor, paths,
    geometryKey: 'seal-' + STIMULUS_VERSION + '-' + seed + '-' + answer + '-' + distractor + '-' + (continuousOuter ? 'outer' : 'inner') + '-' + b % 4 });
}
function pointSegmentDistance(x: number, y: number, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2)) : 0;
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}
export function buildCoverage(stimulus: SealStimulus, size = 512): SealCoverage {
  if (!Number.isInteger(size) || size < 128 || size > 1024) throw new RangeError('Texture size must be 128..1024.');
  const continuous = new Uint8Array(size * size), broken = new Uint8Array(size * size);
  for (const path of stimulus.paths) {
    const mask = path.role === 'continuous' ? continuous : broken, radius = path.width * size / 2;
    for (let k = 1; k < path.points.length; k++) {
      const pa = path.points[k - 1]!, pb = path.points[k]!;
      const a = { x: pa.x * size, y: pa.y * size }, b = { x: pb.x * size, y: pb.y * size };
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius - 1));
      const maxX = Math.min(size - 1, Math.ceil(Math.max(a.x, b.x) + radius + 1));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius - 1));
      const maxY = Math.min(size - 1, Math.ceil(Math.max(a.y, b.y) + radius + 1));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const coverage = Math.round(255 * Math.max(0, Math.min(1, radius + 0.5 - pointSegmentDistance(x + 0.5, y + 0.5, a, b))));
        const i = y * size + x;
        mask[i] = Math.max(mask[i]!, coverage);
      }
    }
  }
  return { size, geometryKey: stimulus.geometryKey, continuous, broken };
}
export function rasterizeSeal(stimulus: SealStimulus, mask: SealCoverage, presentation: Presentation): SealRaster {
  if (!['color', 'neutral'].includes(presentation)) throw new RangeError('Unknown presentation.');
  if (mask.geometryKey !== stimulus.geometryKey || mask.continuous.length !== mask.size ** 2 || mask.broken.length !== mask.size ** 2) throw new RangeError('Mask does not match stimulus.');
  const palette = PALETTES[stimulus.paletteId], bg = parseHex(palette.background);
  const red = parseHex(palette.red), blue = parseHex(palette.blue);
  const foreground = stimulus.preference === 'blue' ? blue : red, other = stimulus.preference === 'blue' ? red : blue;
  const tables = [foreground, other].map(c => Array.from({ length: 256 }, (_, i) => sampleColor(bg, c, i / 255, presentation)));
  const data = new Uint8Array(mask.size * mask.size * 4);
  for (let i = 0; i < mask.size * mask.size; i++) {
    if (mask.continuous[i]! > 0 && mask.broken[i]! > 0) throw new Error('Stimulus paths overlap; visual draw-order cue would be introduced.');
    const table = mask.continuous[i]! > 0 ? tables[0]! : tables[1]!;
    const rgb = table[mask.continuous[i]! || mask.broken[i]!]!;
    data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
  }
  return { width: mask.size, height: mask.size, rgba: data, geometryKey: stimulus.geometryKey, presentation };
}
/** Explicit top-left raster to unflipped DataTexture rows; same visible orientation as setup. */
export function bottomUpRGBA(raster: SealRaster): Uint8Array {
  const stride = raster.width * 4;
  if (raster.rgba.length !== stride * raster.height) throw new RangeError('Malformed raster.');
  const result = new Uint8Array(raster.rgba.length);
  for (let y = 0; y < raster.height; y++) result.set(raster.rgba.subarray(y * stride, (y + 1) * stride), (raster.height - 1 - y) * stride);
  return result;
}
