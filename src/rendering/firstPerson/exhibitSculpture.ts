import * as THREE from 'three';
import { GALLERY_ACTOR_STEP_DISTANCE } from '../../domain/gallery/actor';
export const EXHIBIT_STEP_DISTANCE = GALLERY_ACTOR_STEP_DISTANCE;
/** Hand-authored uneven coat section; no skeleton package or per-frame geometry. */
export function createExhibitCoatGeometry() {
  const rings = [
    { y: .66, rx: .205, rz: .15, z: .055 },
    { y: 1.08, rx: .265, rz: .19, z: .04 },
    { y: 1.48, rx: .29, rz: .185, z: .02 },
    { y: 1.64, rx: .17, rz: .115, z: .015 },
  ];
  const positions: number[] = [], indices: number[] = [];
  rings.forEach((ring, level) => {
    for (let edge = 0; edge < 8; edge++) {
      const a = edge / 8 * Math.PI * 2;
      positions.push(Math.cos(a) * ring.rx, ring.y + (level === 3 ? -Math.cos(a) * .055 : level === 0 ? Math.sin(a) * .045 : 0), ring.z + Math.sin(a) * ring.rz);
    }
  });
  for (let level = 0; level < 3; level++) for (let edge = 0; edge < 8; edge++) {
    const a = level * 8 + edge, b = level * 8 + (edge + 1) % 8;
    indices.push(a, a + 8, b, b, a + 8, b + 8);
  }
  // Eight-sided surface is closed at the neck and lower hem.
  for (let edge = 1; edge < 7; edge++) { indices.push(0, edge, edge + 1); indices.push(24, 25 + edge, 24 + edge); }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'original-asymmetric-display-coat';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
export function exhibitFootPose(distance: number, side: -1 | 1) {
  const cycle = EXHIBIT_STEP_DISTANCE * 2;
  const phase = ((Math.max(0, Number.isFinite(distance) ? distance : 0) / cycle + (side < 0 ? 0 : .5)) % 1);
  const stance = phase < .5;
  const swing = (phase - .5) * 2;
  // During stance local +Z travel exactly cancels forward (-Z) root travel.
  return { x: side * .115, y: stance ? 0 : Math.sin(Math.PI * swing) * .055,
    z: stance ? -EXHIBIT_STEP_DISTANCE / 2 + phase * cycle : EXHIBIT_STEP_DISTANCE / 2 - swing * EXHIBIT_STEP_DISTANCE, stance };
}
