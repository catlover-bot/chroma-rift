import * as THREE from 'three';
import { PALETTES, sampleColor, parseHex, type PaletteId } from '../../domain/emblem/color';
export const EXHIBIT_PATHS = [
  { color: 'red', points: [[.2, .35], [.31, .23], [.31, .77], [.19, .77], [.43, .77]] },
  { color: 'blue', points: [[.53, .23], [.8, .23], [.8, .49], [.59, .49], [.8, .49], [.8, .77], [.53, .77]] },
] as const;
function distanceToLine(x: number, y: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
  const t = Math.max(0, Math.min(1, ((x - a[0]!) * dx + (y - a[1]!) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0]! - t * dx, y - a[1]! - t * dy);
}
/** A single optional exhibition number, not a puzzle answer. Red and blue share
 * one opaque surface and one mask in color/neutral; use the verified color core. */
export function rasterizeChromaticExhibit(size: number, neutral: boolean, palette: PaletteId = 'baseline') {
  if (!Number.isInteger(size) || size < 128 || size > 512) throw new RangeError('Exhibit size must be 128..512.');
  const rgba = new Uint8Array(size * size * 4), mask = new Uint8Array(size * size);
  const colors = PALETTES[palette], background = parseHex(colors.background);
  const pathColors = { red: parseHex(colors.red), blue: parseHex(colors.blue) };
  const presentation = neutral ? 'neutral' : 'color';
  const backgroundRgb = sampleColor(background, background, 0, presentation);
  const solidRgb = { red: sampleColor(background, pathColors.red, 1, presentation), blue: sampleColor(background, pathColors.blue, 1, presentation) };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let coverage = 0, color = background, colorId: 'red' | 'blue' = 'red';
    for (const path of EXHIBIT_PATHS) for (let i = 1; i < path.points.length; i++) {
      const d = distanceToLine((x + .5) / size, (y + .5) / size, path.points[i - 1]!, path.points[i]!);
      const c = Math.max(0, Math.min(1, (.014 - d) * size + .5));
      if (c > coverage) { coverage = c; color = pathColors[path.color]; colorId = path.color; }
    }
    const rgb = coverage === 0 ? backgroundRgb : coverage === 1 ? solidRgb[colorId] : sampleColor(background, color, coverage, presentation), index = y * size + x;
    mask[index] = Math.round(coverage * 255);
    rgba.set([...rgb, 255], index * 4);
  }
  return { width: size, height: size, rgba, mask };
}
export function createChromaticExhibitSurface(size = 256) {
  let palette: PaletteId = 'baseline', neutral = false, disposed = false;
  function make(compare: boolean) {
    const raster = rasterizeChromaticExhibit(size, compare, palette), bytes = new Uint8Array(raster.rgba.length), stride = size * 4;
    for (let row = 0; row < size; row++) bytes.set(raster.rgba.subarray(row * stride, (row + 1) * stride), (size - row - 1) * stride);
    const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
    return texture;
  }
  let maps = [make(false), make(true)];
  const material = new THREE.MeshBasicMaterial({ color: '#FFFFFF', map: maps[0]!, fog: false, toneMapped: false, transparent: false, depthTest: true, depthWrite: true });
  return {
    material,
    update(nextNeutral: boolean, nextPalette: PaletteId = palette) {
      if (disposed) return;
      neutral = nextNeutral;
      if (nextPalette !== palette) { palette = nextPalette; const old = maps; maps = [make(false), make(true)]; old.forEach(m => m.dispose()); }
      material.map = maps[neutral ? 1 : 0]!;
    },
    dispose() { if (disposed) return; disposed = true; maps.forEach(m => m.dispose()); material.dispose(); },
  };
}
