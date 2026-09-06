import * as THREE from 'three';
import { PALETTES } from '../../../domain/emblem/color';
import { rasterizeChromaticExhibit, createChromaticExhibitSurface, EXHIBIT_PATHS } from '../chromaticExhibit';
import { createController, syncCamera, worldForController, controllerSnapshot } from '../runtimeController';
import { galleryAction } from '../galleryController';
import { GALLERY_CHAPTER_ID, GALLERY_CHROMATIC_FIXTURE } from '../../../domain/gallery';

it('shares one planar number mask for all palettes and the voluntary neutral comparison', () => {
  expect(EXHIBIT_PATHS.map(path => path.color)).toEqual(['red', 'blue']);
  const base = rasterizeChromaticExhibit(128, false);
  for (const palette of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
    const color = rasterizeChromaticExhibit(128, false, palette), neutral = rasterizeChromaticExhibit(128, true, palette);
    expect(color.mask).toEqual(base.mask); expect(neutral.mask).toEqual(color.mask);
    expect(color.rgba).not.toEqual(neutral.rgba);
    for (let index = 0; index < neutral.rgba.length; index += 4) {
      expect(neutral.rgba[index]).toBe(neutral.rgba[index + 1]);
      expect(neutral.rgba[index + 1]).toBe(neutral.rgba[index + 2]);
      expect(neutral.rgba[index + 3]).toBe(255);
    }
  }
});
it('reuses the one opaque material and its two owned maps across comparison, disposing once', () => {
  const surface = createChromaticExhibitSurface(128), material = surface.material, original = material.map!;
  const disposal = jest.fn(); material.addEventListener('dispose', disposal); original.addEventListener('dispose', disposal);
  expect(material).toMatchObject({ transparent: false, toneMapped: false, fog: false, depthTest: true, depthWrite: true });
  surface.update(true); const neutral = material.map!; neutral.addEventListener('dispose', disposal);
  expect(neutral).not.toBe(original); expect(neutral.colorSpace).toBe(THREE.SRGBColorSpace);
  surface.update(false); expect(material.map).toBe(original);
  expect(surface.material).toBe(material);
  surface.dispose(); surface.dispose(); expect(disposal).toHaveBeenCalledTimes(3);
});
it('authorizes optional number comparison from its actual fixture without changing progress, actor, camera or world', () => {
  const c = createController(undefined, false, true, GALLERY_CHAPTER_ID);
  c.runtime.pose = { position: { x: -.5, y: GALLERY_CHROMATIC_FIXTURE.center.y, z: -2 }, yaw: Math.PI / 2, pitch: 0 };
  Object.assign(c.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true, paused: false, open: false });
  const camera = new THREE.PerspectiveCamera(65, 390 / 740, .08, 60); syncCamera(c, camera);
  expect(controllerSnapshot(c).target?.id).toBe('chromatic-exhibit');
  const progress = structuredClone(c.runtime.progress), actor = structuredClone(c.runtime.gallery!.actor), pose = structuredClone(c.runtime.pose), world = worldForController(c);
  const matrices = c.matrices;
  expect(galleryAction(c, { type: 'chromatic-compare' })).toBe(true);
  expect(c.runtime.gallery!.chromaticNeutral).toBe(true);
  expect(c.runtime.progress).toEqual(progress); expect(c.runtime.gallery!.actor).toEqual(actor);
  expect(c.runtime.pose).toEqual(pose); expect(c.matrices).toBe(matrices); expect(worldForController(c)).toEqual(world);
  expect(c.runtime.progress.sealA).toBe(false); expect(c.runtime.progress.sealB).toBe(false);
});
