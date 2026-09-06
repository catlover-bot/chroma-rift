import * as THREE from 'three';
import { CONTOUR_BACKGROUND, CONTOUR_DISC_RADIUS, CONTOUR_INK, CONTOUR_WEDGE_ANGLE } from '../../domain/gallery';
import { galleryRaster } from './galleryGraphics';
export function createGalleryResources() {
  const materials: THREE.Material[] = [], geometries: THREE.BufferGeometry[] = [], textures: THREE.Texture[] = [];
  const basic = (color: string) => {
    const material = new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false, transparent: false, depthTest: true, depthWrite: true });
    materials.push(material); return material;
  };
  const texture = (compare: boolean) => {
    const r = galleryRaster('shadow', 512, { compare, samples: false });
    const bytes = new Uint8Array(r.rgba.length), stride = r.width * 4;
    for (let y = 0; y < r.height; y++) bytes.set(r.rgba.subarray(y * stride, (y + 1) * stride), (r.height - y - 1) * stride);
    const t = new THREE.DataTexture(bytes, r.width, r.height, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.generateMipmaps = false;
    t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; textures.push(t); return t;
  };
  const colorMap = texture(false), neutralMap = texture(true);
  const shadowPanel = basic('#FFFFFF'); shadowPanel.map = colorMap;
  const sampleMaterials = { '#808080': basic('#808080'), '#B0B0B0': basic('#B0B0B0'), '#505050': basic('#505050') };
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  const start = CONTOUR_WEDGE_ANGLE / 2, end = 2 * Math.PI - start;
  for (let i = 0; i <= 72; i++) {
    const a = start + (end - start) * i / 72;
    shape.lineTo(Math.cos(a) * CONTOUR_DISC_RADIUS, Math.sin(a) * CONTOUR_DISC_RADIUS);
  }
  shape.closePath();
  const inducer = new THREE.ShapeGeometry(shape); geometries.push(inducer);
  const warm = basic('#AA8466'), bright = basic(CONTOUR_BACKGROUND), ink = basic(CONTOUR_INK), guide = basic('#8A6540');
  const shelf = basic('#707070'), outline = basic('#D4C9AA'), selected = basic('#F2D38B');
  const roomA = new THREE.MeshLambertMaterial({ color: '#938071' });
  const roomB = new THREE.MeshLambertMaterial({ color: '#879392' });
  const roomC = new THREE.MeshLambertMaterial({ color: '#B8B4A8' });
  const roomD = new THREE.MeshLambertMaterial({ color: '#777F8B' });
  materials.push(roomA, roomB, roomC, roomD);
  let closed = false;
  return { shadowPanel, sampleMaterials, inducer, warm, bright, ink, guide, shelf, outline, selected, roomA, roomB, roomC, roomD,
    setComparison(compare: boolean) { if (!closed) shadowPanel.map = compare ? neutralMap : colorMap; },
    dispose() { if (closed) return; closed = true; materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); },
  };
}
export type GalleryResources = ReturnType<typeof createGalleryResources>;
