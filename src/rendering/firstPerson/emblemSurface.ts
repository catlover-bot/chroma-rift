import * as THREE from 'three';

import { bottomUpRGBA, EMBLEM_SEED, getSealRasterPair, PALETTES, parseHex, sampleColor, STIMULUS_VERSION, type PaletteId, type Preference, type Presentation, type SealRaster } from '../../domain/emblem';

export type EmblemAppearance = { seed: number; palette: PaletteId; preference: Preference; presentation: Presentation; assist: boolean };
export const DEFAULT_EMBLEM_APPEARANCE: EmblemAppearance = { seed: EMBLEM_SEED, palette: 'baseline', preference: 'unknown', presentation: 'color', assist: false };

type RasterPair = ReturnType<typeof getSealRasterPair>;
type TexturePair = { pair: RasterPair; color: THREE.DataTexture; neutral: THREE.DataTexture; guideColor?: THREE.DataTexture; guideNeutral?: THREE.DataTexture };

/** Optional labelled guidance changes only the existing continuous mask's
 * color. It is a static answer cue, not a clean perception presentation. */
export function guidedEmblemRaster(pair: RasterPair, presentation: Presentation): SealRaster {
  const original = pair[presentation];
  const rgba = new Uint8Array(original.rgba);
  const background = parseHex(PALETTES[pair.stimulus.paletteId].background);
  const table = Array.from({ length: 256 }, (_, coverage) => sampleColor(background, [235, 235, 235], coverage / 255, presentation));
  for (let index = 0; index < pair.mask.continuous.length; index += 1) {
    const coverage = pair.mask.continuous[index]!;
    if (!coverage) continue;
    const color = table[coverage]!;
    rgba[index * 4] = color[0]; rgba[index * 4 + 1] = color[1]; rgba[index * 4 + 2] = color[2];
  }
  return { ...original, rgba };
}
function nativeTexture(raster: SealRaster): THREE.DataTexture {
  const texture = new THREE.DataTexture(bottomUpRGBA(raster), raster.width, raster.height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
function releaseTextures(pair: TexturePair): void {
  pair.color.dispose(); pair.neutral.dispose(); pair.guideColor?.dispose(); pair.guideNeutral?.dispose();
}

/** One material for this scene mount. Seed/palette/preference are cached on
 * semantic updates; comparison/guide only select opaque texture maps.
 * This owner never allocates geometry, a Canvas, or a renderer. */
export function createEmblemSurface(size: number, initial: EmblemAppearance = DEFAULT_EMBLEM_APPEARANCE) {
  const cache = new Map<string, TexturePair>();
  const material = new THREE.MeshBasicMaterial({
    color: '#FFFFFF', toneMapped: false, fog: false, transparent: false,
    opacity: 1, depthTest: true, depthWrite: true, side: THREE.FrontSide,
  });
  let closed = false;
  let current = initial;
  let currentPair: RasterPair | undefined;
  const update = (next: EmblemAppearance) => {
    if (closed) return;
    const key = [STIMULUS_VERSION, next.seed, next.palette, next.preference, size].join('|');
    let textures = cache.get(key);
    if (!textures) {
      const pair = getSealRasterPair(next.seed, next.palette, next.preference, size);
      const color = nativeTexture(pair.color);
      try { textures = { pair, color, neutral: nativeTexture(pair.neutral) }; }
      catch (error) { color.dispose(); throw error; }
      cache.set(key, textures);
    } else { cache.delete(key); cache.set(key, textures); }
    if (next.assist && !textures.guideColor) {
      textures.guideColor = nativeTexture(guidedEmblemRaster(textures.pair, 'color'));
      try { textures.guideNeutral = nativeTexture(guidedEmblemRaster(textures.pair, 'neutral')); }
      catch (error) { textures.guideColor.dispose(); delete textures.guideColor; throw error; }
    }
    const selected = next.assist ? next.presentation === 'neutral' ? textures.guideNeutral! : textures.guideColor! : textures[next.presentation];
    const previouslyMapped = material.map !== null;
    material.map = selected;
    if (!previouslyMapped) material.needsUpdate = true;
    current = { ...next };
    currentPair = textures.pair;
    // Replace the visible map before any eviction, so no displayed material
    // can retain an already-disposed texture. Eight variants bound this owner.
    while (cache.size > 8) {
      const oldest = cache.keys().next().value!;
      releaseTextures(cache.get(oldest)!);
      cache.delete(oldest);
    }
  };
  try { update(initial); } catch (error) { material.dispose(); for (const pair of cache.values()) releaseTextures(pair); throw error; }
  return {
    material, size,
    get stimulus() { return currentPair!.stimulus; },
    get appearance() { return current; },
    get textures(): readonly THREE.DataTexture[] { return [...cache.values()].flatMap((pair) => [pair.color, pair.neutral, ...(pair.guideColor ? [pair.guideColor] : []), ...(pair.guideNeutral ? [pair.guideNeutral] : [])]); },
    update,
    dispose() {
      if (closed) return;
      closed = true;
      material.map = null;
      material.dispose();
      for (const pair of cache.values()) releaseTextures(pair);
      cache.clear();
    },
  };
}
