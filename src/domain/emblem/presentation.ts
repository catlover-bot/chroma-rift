import { buildCoverage, createSealStimulus, rasterizeSeal, type Preference, type SealCoverage } from './stimulus';
import type { PaletteId } from './color';

export const EMBLEM_RASTER_SIZE = 512;
const masks = new Map<string, SealCoverage>();
const pairs = new Map<string, ReturnType<typeof prepare>>();
function prepare(seed: number, palette: PaletteId, preference: Preference, size: number) {
  const stimulus = createSealStimulus(seed, palette, preference);
  const key = stimulus.geometryKey + '-' + size;
  let mask = masks.get(key);
  if (!mask) {
    mask = buildCoverage(stimulus, size);
    if (masks.size >= 8) masks.delete(masks.keys().next().value!);
    masks.set(key, mask);
  }
  return { stimulus, mask, color: rasterizeSeal(stimulus, mask, 'color'), neutral: rasterizeSeal(stimulus, mask, 'neutral') };
}
/** Shared immutable-by-contract raster cache. No frame loop calls rasterization. */
export function getSealRasterPair(seed: number, palette: PaletteId = 'baseline', preference: Preference = 'unknown', size = EMBLEM_RASTER_SIZE) {
  const key = seed + '-' + palette + '-' + preference + '-' + size;
  let pair = pairs.get(key);
  if (!pair) {
    pair = prepare(seed, palette, preference, size);
    if (pairs.size >= 8) pairs.delete(pairs.keys().next().value!);
    pairs.set(key, pair);
  }
  return pair;
}
