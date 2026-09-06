import { getSealRasterPair } from './presentation';
import type { SealRaster, SealStimulus } from './stimulus';
import type { Presentation } from './color';

type Disposable = { dispose(): void };
export type SealMaterialOptions = { color: '#FFFFFF'; toneMapped: false; fog: false; transparent: false; depthTest: true; depthWrite: true };
export type SealSurfaceFactory<T extends Disposable, M extends Disposable & { map: T | null }> = {
  texture(raster: SealRaster): T;
  material(texture: T, options: SealMaterialOptions): M;
};
/** One owner per mounted wall/seed/preset; presentation swaps only the map. */
export function createSealSurface<T extends Disposable, M extends Disposable & { map: T | null }>(stimulus: SealStimulus, factory: SealSurfaceFactory<T, M>, size = 512) {
  const pair = getSealRasterPair(stimulus.seed, stimulus.paletteId, stimulus.preference, size);
  let color: T | undefined, neutral: T | undefined, material: M | undefined;
  try {
    color = factory.texture(pair.color);
    neutral = factory.texture(pair.neutral);
    material = factory.material(color, { color: '#FFFFFF', toneMapped: false, fog: false, transparent: false, depthTest: true, depthWrite: true });
  } catch (error) { material?.dispose(); neutral?.dispose(); color?.dispose(); throw error; }
  const textures = { color, neutral }, ownedMaterial = material;
  let closed = false, mode: Presentation = 'color';
  return {
    material: ownedMaterial, geometryKey: stimulus.geometryKey,
    get presentation() { return mode; },
    setPresentation(next: Presentation) {
      if (closed) throw new Error('Cannot update disposed seal surface.');
      if (next !== 'color' && next !== 'neutral') throw new RangeError('Unknown presentation.');
      if (next === mode) return;
      ownedMaterial.map = textures[next]; mode = next;
    },
    dispose() {
      if (closed) return;
      closed = true; ownedMaterial.dispose(); textures.color.dispose(); textures.neutral.dispose();
    },
  };
}
