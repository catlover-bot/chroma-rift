import * as THREE from 'three';
import maskData from '../../../assets/perceptual/hollow-mask.json';
import hybridData from '../../../assets/perceptual/hybrid-texture.json';

export const HOLLOW_MASK_ASSET_ID = maskData.id;
export const HYBRID_ASSET_ID = hybridData.id;
export const HYBRID_DIMENSIONS = { width: hybridData.width, height: hybridData.height } as const;
export const PERCEPTUAL_MASK_BOUNDS = { min: [-.4001147, -.5, -.5550166], max: [.4001147, .5, 0] } as const;
/** Small pure decoder avoids Buffer, DOM image loaders and Three addons in RN. */
function decodeBase64(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const output = new Uint8Array(input.length * 3 / 4 - (input.endsWith('==') ? 2 : input.endsWith('=') ? 1 : 0));
  let bits = 0, count = 0, offset = 0;
  for (const ch of input) {
    if (ch === '=') break;
    const code = alphabet.indexOf(ch);
    if (code < 0) throw new Error('Invalid bundled hybrid bytes');
    bits = (bits << 6) | code; count += 6;
    if (count >= 8) { count -= 8; output[offset++] = (bits >>> count) & 255; }
  }
  return output;
}
/** Offline geometry and one immutable texture. No camera/distance/palette API:
 * ordinary projection and GPU sampling are the only changing hybrid presentation.
 * Local +Z is the hollow viewing side; use positive world scale and FrontSide. */
export function createPerceptualResources() {
  const maskGeometry = new THREE.BufferGeometry();
  maskGeometry.name = HOLLOW_MASK_ASSET_ID;
  maskGeometry.setAttribute('position', new THREE.Float32BufferAttribute(maskData.positions, 3));
  maskGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(maskData.normals, 3));
  maskGeometry.setIndex(maskData.indices);
  maskGeometry.computeBoundingBox(); maskGeometry.computeBoundingSphere();
  // Explicit control for QA/education only. It is not swapped into the in-world mask.
  const convexControlGeometry = maskGeometry.clone();
  convexControlGeometry.name = HOLLOW_MASK_ASSET_ID + '-convex-control';
  const controlPositions = convexControlGeometry.getAttribute('position');
  for (let i = 0; i < controlPositions.count; i++) controlPositions.setZ(i, -controlPositions.getZ(i));
  const controlIndices = maskData.indices.slice();
  // This open surface is viewed from +Z in both controls. Preserve XY winding;
  // reversing it after a depth reflection would incorrectly expose only the back.
  convexControlGeometry.setIndex(controlIndices); convexControlGeometry.computeVertexNormals();
  convexControlGeometry.computeBoundingBox(); convexControlGeometry.computeBoundingSphere();
  const maskMaterial = new THREE.MeshLambertMaterial({ color: '#D8D2C0', side: THREE.FrontSide, depthTest: true, depthWrite: true, transparent: false });
  const gray = decodeBase64(hybridData.pixelsBase64);
  if (gray.length !== hybridData.width * hybridData.height) throw new Error('Invalid bundled hybrid size');
  const rgba = new Uint8Array(gray.length * 4);
  for (let y = 0; y < hybridData.height; y++) for (let x = 0; x < hybridData.width; x++) {
    const source = gray[y * hybridData.width + x]!, target = ((hybridData.height - y - 1) * hybridData.width + x) * 4;
    rgba[target] = rgba[target + 1] = rgba[target + 2] = source; rgba[target + 3] = 255;
  }
  const hybridTexture = new THREE.DataTexture(rgba, hybridData.width, hybridData.height, THREE.RGBAFormat);
  hybridTexture.name = HYBRID_ASSET_ID;
  hybridTexture.colorSpace = THREE.SRGBColorSpace; hybridTexture.flipY = false;
  hybridTexture.generateMipmaps = true; hybridTexture.minFilter = THREE.LinearMipmapLinearFilter;
  hybridTexture.magFilter = THREE.LinearFilter; hybridTexture.needsUpdate = true;
  const hybridMaterial = new THREE.MeshBasicMaterial({ map: hybridTexture, color: '#FFFFFF', toneMapped: false, side: THREE.FrontSide, depthTest: true, depthWrite: true, transparent: false });
  let closed = false;
  return { maskGeometry, convexControlGeometry, maskMaterial, hybridTexture, hybridMaterial,
    textureBytes: rgba.byteLength, textureBytesWithMipmaps: 1398100,
    dispose() { if (closed) return; closed = true; maskGeometry.dispose(); convexControlGeometry.dispose(); maskMaterial.dispose(); hybridTexture.dispose(); hybridMaterial.dispose(); },
  };
}
export type PerceptualResources = ReturnType<typeof createPerceptualResources>;
