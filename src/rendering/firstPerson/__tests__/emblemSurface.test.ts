import * as THREE from 'three';

import { bottomUpRGBA, EMBLEM_SEED, getSealRasterPair } from '../../../domain/emblem';
import { createEmblemSurface, DEFAULT_EMBLEM_APPEARANCE, guidedEmblemRaster } from '../emblemSurface';

describe('scene-owned native emblem surface (no GPU)', () => {
  it('binds the shared setup raster as opaque sRGB with explicit matching row orientation', () => {
    const surface = createEmblemSurface(256);
    const shared = getSealRasterPair(EMBLEM_SEED, 'baseline', 'unknown', 256);
    const texture = surface.material.map as THREE.DataTexture;
    expect(surface.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(surface.material).toMatchObject({ toneMapped: false, fog: false, transparent: false, opacity: 1, depthTest: true, depthWrite: true });
    expect(surface.material.color.toArray()).toEqual([1, 1, 1]);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.flipY).toBe(false);
    expect(texture.image).toMatchObject({ width: 256, height: 256 });
    const pixels = texture.image.data as Uint8Array;
    expect(pixels).toEqual(bottomUpRGBA(shared.color));
    expect(new Set(pixels).size).toBeGreaterThan(20);
    expect(pixels.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
    surface.dispose();
  });
  it('swaps cached maps without replacing material, masks, dimensions or clean stimulus pixels', () => {
    const surface = createEmblemSurface(128);
    const material = surface.material;
    const color = material.map;
    const clean = new Uint8Array((color as THREE.DataTexture).image.data as Uint8Array);
    const key = surface.stimulus.geometryKey;
    surface.update({ ...DEFAULT_EMBLEM_APPEARANCE, presentation: 'neutral' });
    const neutral = material.map;
    expect(neutral).not.toBe(color);
    expect(surface.textures).toHaveLength(2);
    for (let repeat = 0; repeat < 10; repeat += 1) {
      surface.update(DEFAULT_EMBLEM_APPEARANCE);
      expect(material.map).toBe(color);
      surface.update({ ...DEFAULT_EMBLEM_APPEARANCE, presentation: 'neutral' });
      expect(material.map).toBe(neutral);
    }
    surface.update({ ...DEFAULT_EMBLEM_APPEARANCE, palette: 'alternate', preference: 'blue' });
    expect(surface.material).toBe(material);
    expect(surface.stimulus.geometryKey).toBe(key);
    surface.update(DEFAULT_EMBLEM_APPEARANCE);
    expect(material.map).toBe(color);
    expect((color as THREE.DataTexture).image.data).toEqual(clean);
    expect(surface.textures).toHaveLength(4);
    surface.dispose();
  });
  it('makes guidance a static recoloring of the existing continuous coverage only', () => {
    const pair = getSealRasterPair(EMBLEM_SEED, 'baseline', 'unknown', 128);
    const original = new Uint8Array(pair.color.rgba);
    const guide = guidedEmblemRaster(pair, 'color');
    expect(guide.geometryKey).toBe(pair.color.geometryKey);
    expect([guide.width, guide.height]).toEqual([pair.color.width, pair.color.height]);
    let changed = 0;
    for (let index = 0; index < pair.mask.continuous.length; index += 1) {
      const before = pair.color.rgba.subarray(index * 4, index * 4 + 4);
      const after = guide.rgba.subarray(index * 4, index * 4 + 4);
      if (!pair.mask.continuous[index]) expect(after).toEqual(before);
      else if (!after.every((value, channel) => value === before[channel])) changed += 1;
      expect(after[3]).toBe(255);
    }
    expect(changed).toBeGreaterThan(100);
    expect(pair.color.rgba).toEqual(original);
    const surface = createEmblemSurface(128);
    const cleanMap = surface.material.map;
    surface.update({ ...DEFAULT_EMBLEM_APPEARANCE, assist: true });
    const guideMap = surface.material.map;
    expect((guideMap as THREE.DataTexture).image.data).toEqual(bottomUpRGBA(guide));
    expect(surface.textures).toHaveLength(4);
    surface.update(DEFAULT_EMBLEM_APPEARANCE);
    expect(surface.material.map).toBe(cleanMap);
    surface.update({ ...DEFAULT_EMBLEM_APPEARANCE, assist: true });
    expect(surface.material.map).toBe(guideMap);
    expect(surface.textures).toHaveLength(4);
    surface.dispose();
  });
  it('releases every cached texture once and never disposes a currently displayed map', () => {
    const surface = createEmblemSurface(128);
    const disposed = new Map<THREE.Texture, number>();
    const observed = new Set<THREE.Texture>();
    const watch = () => {
      for (const texture of surface.textures) {
        if (observed.has(texture)) continue;
        observed.add(texture);
        texture.addEventListener('dispose', () => {
          expect(surface.material.map).not.toBe(texture);
          disposed.set(texture, (disposed.get(texture) ?? 0) + 1);
        });
      }
    };
    const materialDisposed = jest.fn();
    surface.material.addEventListener('dispose', materialDisposed);
    watch();
    for (let seed = 30; seed < 41; seed += 1) {
      surface.update({ ...DEFAULT_EMBLEM_APPEARANCE, seed, assist: true });
      watch();
    }
    expect(surface.textures.length).toBeLessThanOrEqual(32);
    expect(disposed.size).toBeGreaterThan(0);
    surface.dispose();
    surface.dispose();
    surface.update(DEFAULT_EMBLEM_APPEARANCE);
    expect(disposed.size).toBe(observed.size);
    expect([...disposed.values()].every((count) => count === 1)).toBe(true);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(surface.textures).toEqual([]);
  });
});
