import * as THREE from 'three';

import { illusionPalette, type PreferredColor } from '../IllusionPalette';

/** Explicitly owned by one scene mount; no geometries or materials are made in useFrame. */
export function createSceneResources(lowQuality: boolean) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, lowQuality ? 5 : 8);
  const ring = new THREE.RingGeometry(0.34, 0.39, lowQuality ? 24 : 48);
  const basic = (color: string) => new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false });
  const wall = new THREE.MeshLambertMaterial({ color: '#A0AAA8', flatShading: true });
  const floor = new THREE.MeshLambertMaterial({ color: '#707D7B', flatShading: true });
  const door = new THREE.MeshLambertMaterial({ color: '#435551', flatShading: true });
  const device = new THREE.MeshLambertMaterial({ color: '#D0CDBB', flatShading: true });
  const neutral = basic('#E0DDC9');
  const quiet = basic('#899993');
  const dark = basic('#293B39');
  const key = basic('#E6D8A8');
  const textureSize = lowQuality ? 128 : 256;
  const texture = new THREE.DataTexture(new Uint8Array(textureSize * textureSize * 4), textureSize, textureSize, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const panel = new THREE.MeshBasicMaterial({ map: texture, color: '#FFFFFF', toneMapped: false, fog: false, transparent: false, side: THREE.DoubleSide });
  const updatePalette = (preferred: PreferredColor, neutralColors: boolean, strength: 'low' | 'medium' | 'high') => {
    const palette = illusionPalette(preferred, neutralColors, strength);
    const rgb = palette.map((hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)));
    const data = texture.image.data as Uint8Array;
    for (let y = 0; y < textureSize; y += 1) {
      for (let x = 0; x < textureSize; x += 1) {
        const u = (x + 0.5) / textureSize;
        const v = (y + 0.5) / textureSize;
        const ringDistance = Math.hypot((u - 0.5) * 1.2, v - 0.5);
        const band = Math.floor(ringDistance * 13);
        const inBand = ringDistance < 0.53 && ringDistance > 0.12 && (ringDistance * 13) % 1 < 0.62;
        const color = inBand ? rgb[band % 2]! : [79, 90, 89];
        const offset = (y * textureSize + x) * 4;
        data[offset] = color[0]!; data[offset + 1] = color[1]!; data[offset + 2] = color[2]!; data[offset + 3] = 255;
      }
    }
    texture.needsUpdate = true;
  };
  updatePalette('neutral', false, 'medium');
  return {
    box, plane, cylinder, ring, wall, floor, door, device, neutral, quiet, dark, key, panel, texture, updatePalette,
    dispose() {
      box.dispose(); plane.dispose(); cylinder.dispose(); ring.dispose(); texture.dispose();
      [wall, floor, door, device, neutral, quiet, dark, key, panel].forEach((material) => material.dispose());
    },
  };
}
export type SceneResources = ReturnType<typeof createSceneResources>;
