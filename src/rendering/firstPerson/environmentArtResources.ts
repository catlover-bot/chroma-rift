import * as THREE from 'three';

export type FacilitySurface = 'paint' | 'terrazzo' | 'enamel' | 'timber';

// Bounded immutable CPU cache: at most four tiles at each of two resolutions.
// Each mount still owns its independent GPU textures and their disposal.
const tilePixels = new Map<string, { pixels: Uint8Array; relief: Uint8Array }>();

/** Authored, deterministic material tiles. Color is sRGB; relief/roughness
 * remains linear data. These resources never feed an illusion stimulus. */
function surfaceTile(kind: FacilitySurface, size: number) {
  const cacheKey = `${kind}:${size}`;
  let data = tilePixels.get(cacheKey);
  if (!data) {
  const pixels = new Uint8Array(size * size * 4), relief = new Uint8Array(size * size * 4);
  const base = { paint: [190, 187, 166], terrazzo: [100, 112, 106], enamel: [146, 159, 145], timber: [130, 95, 65] }[kind]!;
  let seed = 0x14c0ffee;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = noise(), u = x / size, v = y / size;
    const grain = kind === 'timber' ? Math.sin(u * 115 + Math.sin(v * 14) * 2 + Math.sin(u * 25 + v * 7)) : 0;
    const fleck = n > .97 ? 28 : n < .025 ? -25 : (n - .5) * 9;
    const variation = kind === 'timber' ? grain * 12 + (n - .5) * 6 :
      kind === 'terrazzo' ? fleck : kind === 'enamel' ? (n - .5) * 3 : (n - .5) * 11;
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) pixels[i + c] = Math.max(0, Math.min(255, base[c]! + variation));
    pixels[i + 3] = 255;
    relief[i] = relief[i + 1] = relief[i + 2] = Math.max(0, Math.min(255, 220 + variation)); relief[i + 3] = 255;
  }
  data = { pixels, relief }; tilePixels.set(cacheKey, data);
  }
  const texture = (data: Uint8Array, color: boolean) => {
    const result = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.magFilter = THREE.LinearFilter; result.minFilter = THREE.LinearMipmapLinearFilter;
    result.generateMipmaps = true; result.needsUpdate = true;
    return result;
  };
  return { color: texture(data.pixels, true), relief: texture(data.relief, false) };
}

/** Rounded edge positions and normals with the box's authored face UVs.
 * Unit dimensions are retained, including the complete collision envelope. */
export function createBeveledBox(segments = 4, radius = .06): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1, segments, segments, segments);
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const inner = .5 - radius, point = new THREE.Vector3(), nearest = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    nearest.set(Math.max(-inner, Math.min(inner, point.x)), Math.max(-inner, Math.min(inner, point.y)), Math.max(-inner, Math.min(inner, point.z)));
    const outward = point.clone().sub(nearest).normalize();
    point.copy(nearest).addScaledVector(outward, radius);
    position.setXYZ(i, point.x, point.y, point.z); normal.setXYZ(i, outward.x, outward.y, outward.z);
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createEnvironmentArtResources(lowQuality: boolean) {
  const size = lowQuality ? 256 : 512;
  const tiles = { paint: surfaceTile('paint', size), terrazzo: surfaceTile('terrazzo', size),
    enamel: surfaceTile('enamel', size), timber: surfaceTile('timber', size) };
  const material = (kind: FacilitySurface, roughness: number, bump: number) => new THREE.MeshStandardMaterial({
    map: tiles[kind].color, roughnessMap: tiles[kind].relief, bumpMap: lowQuality ? null : tiles[kind].relief,
    bumpScale: bump, roughness, metalness: 0,
  });
  const paint = material('paint', .96, .006), floor = material('terrazzo', .8, .008);
  const enamel = material('enamel', .57, .002), timber = material('timber', .88, .005);
  const metal = new THREE.MeshStandardMaterial({ color: '#6e7c79', roughness: .42, metalness: .65 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#252d2b', roughness: .98 });
  const paper = new THREE.MeshStandardMaterial({ color: '#e5dfca', roughness: .96 });
  const brass = new THREE.MeshStandardMaterial({ color: '#a29364', roughness: .39, metalness: .55 });
  const marking = new THREE.MeshBasicMaterial({ color: '#d7cc9f', toneMapped: false, fog: false });
  const contact = new THREE.MeshBasicMaterial({ color: '#17221f', transparent: true, opacity: .24,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const glow = new THREE.MeshBasicMaterial({ color: '#f2e8c9', toneMapped: false, fog: false });
  const beveled = createBeveledBox(lowQuality ? 2 : 4);
  const bell = new THREE.LatheGeometry([
    new THREE.Vector2(.30, 0), new THREE.Vector2(.29, .035), new THREE.Vector2(.22, .09),
    new THREE.Vector2(.16, .2), new THREE.Vector2(.09, .27), new THREE.Vector2(.025, .285),
  ], lowQuality ? 12 : 24);
  const pulley = new THREE.TorusGeometry(.19, .035, lowQuality ? 5 : 8, lowQuality ? 16 : 28);
  return { lowQuality, paint, floor, enamel, timber, metal, rubber, paper, brass, marking, contact, glow, beveled, bell, pulley,
    textureBytes: 4 * 2 * size * size * 4 * 4 / 3,
    dispose() {
      Object.values(tiles).forEach(tile => { tile.color.dispose(); tile.relief.dispose(); });
      [paint, floor, enamel, timber, metal, rubber, paper, brass, marking, contact, glow].forEach(item => item.dispose());
      beveled.dispose(); bell.dispose(); pulley.dispose();
    } };
}
