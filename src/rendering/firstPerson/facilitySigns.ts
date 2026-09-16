import * as THREE from 'three';
import { FACILITY_SIGN_HEIGHT, FACILITY_SIGN_MASKS, FACILITY_SIGN_WIDTH, type FacilitySignId } from './facilitySignData';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bitMask(encoded: string): Uint8Array {
  const bytes = new Uint8Array(FACILITY_SIGN_WIDTH * FACILITY_SIGN_HEIGHT / 8);
  let value = 0, bits = 0, count = 0;
  for (const character of encoded) {
    if (character === '=') break;
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Invalid destination sign encoding');
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (count >= bytes.length) throw new Error('Destination sign is too long');
      bytes[count++] = (value >> bits) & 255;
      value &= (1 << bits) - 1;
    }
  }
  if (count !== bytes.length || value !== 0) throw new Error('Destination sign is incomplete');
  return bytes;
}

function rgb(hex: string): readonly [number, number, number] {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

export function createFacilitySign(id: FacilitySignId) {
  const width = FACILITY_SIGN_WIDTH, height = FACILITY_SIGN_HEIGHT;
  const bits = bitMask(FACILITY_SIGN_MASKS[id]);
  const background = rgb('#263e38'), ink = rgb('#e8e1c7');
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const color = bits[index >> 3]! & (1 << (7 - index % 8)) ? ink : background;
    const offset = ((height - 1 - y) * width + x) * 4;
    pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, fog: false });
  return { texture, material, dispose() { material.dispose(); texture.dispose(); } };
}
