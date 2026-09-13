import * as THREE from 'three';
import { DESTINATION_SIGN_HEIGHT, DESTINATION_SIGN_MASKS, DESTINATION_SIGN_WIDTH, type DestinationSignId } from './destinationSignData';

const palette: Record<DestinationSignId, { background: string; ink: string }> = {
  '02': { background: '#477965', ink: '#F0E6CF' },
  '03': { background: '#B9B7A7', ink: '#303B38' },
  '04': { background: '#303738', ink: '#E5E8DF' },
};
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bitMask(encoded: string): Uint8Array {
  const bytes = new Uint8Array(DESTINATION_SIGN_WIDTH * DESTINATION_SIGN_HEIGHT / 8);
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

export function createDestinationSign(id: DestinationSignId) {
  const width = DESTINATION_SIGN_WIDTH, height = DESTINATION_SIGN_HEIGHT;
  const bits = bitMask(DESTINATION_SIGN_MASKS[id]);
  const background = rgb(palette[id].background), ink = rgb(palette[id].ink);
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
