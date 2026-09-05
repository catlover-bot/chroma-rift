import * as THREE from 'three';

import { createSceneResources } from '../resources';

describe('first-person native scene resources', () => {
  it('uses opaque unlit panels with explicit sRGB input and updates only their colors', () => {
    const resources = createSceneResources(false);
    const geometryId = resources.plane.uuid;
    const textureId = resources.texture.uuid;
    const original = new Uint8Array(resources.texture.image.data as Uint8Array);
    expect(resources.panel).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(resources.panel.transparent).toBe(false);
    expect(resources.panel.toneMapped).toBe(false);
    expect(resources.panel.fog).toBe(false);
    expect(resources.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    resources.updatePalette('neutral', true, 'medium');
    const neutral = resources.texture.image.data as Uint8Array;
    expect(neutral).not.toEqual(original);
    for (let index = 0; index < neutral.length; index += 4) {
      if (original[index] === 79 && original[index + 1] === 90) continue;
      expect(neutral[index]).toBe(neutral[index + 1]);
      expect(neutral[index + 1]).toBe(neutral[index + 2]);
      expect(neutral[index + 3]).toBe(255);
    }
    expect(resources.texture.uuid).toBe(textureId);
    expect(resources.plane.uuid).toBe(geometryId);
    resources.updatePalette('neutral', false, 'medium');
    expect(resources.texture.image.data).toEqual(original);
    resources.dispose();
  });
  it('releases every scene-owned geometry, material and texture across ten replay mounts', () => {
    for (let replay = 0; replay < 10; replay += 1) {
      const resources = createSceneResources(replay % 2 === 0);
      const values: unknown[] = Object.values(resources);
      const owned = values.filter((value): value is THREE.BufferGeometry | THREE.Material | THREE.Texture => value instanceof THREE.BufferGeometry || value instanceof THREE.Material || value instanceof THREE.Texture);
      const disposeEvents = new Map<object, number>();
      for (const resource of owned) resource.addEventListener('dispose', () => disposeEvents.set(resource, (disposeEvents.get(resource) ?? 0) + 1));
      resources.dispose();
      expect(disposeEvents.size).toBe(owned.length);
      expect([...disposeEvents.values()].every((count) => count === 1)).toBe(true);
    }
  });
  it('low quality reduces texture pixels while keeping the same opaque shader path', () => {
    const low = createSceneResources(true);
    const standard = createSceneResources(false);
    expect(low.texture.image.width).toBeLessThan(standard.texture.image.width);
    expect(low.panel.type).toBe(standard.panel.type);
    low.dispose(); standard.dispose();
  });
});
