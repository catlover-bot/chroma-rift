import type { Vec3 } from '../firstPerson/types';

export const AMES_SPEC = Object.freeze({ referenceEye: { x: 0, y: 1.6, z: 0 }, minX: -1.1, maxX: 1.1, floorY: .4, ceilingY: 3, frontZ: 4, backZ: 6, depth: 5.2, skew: 1.7, worldOrigin: { x: -4, y: 0, z: 7 }, propWidth: .22, propHeight: .82, propDepth: .22 });
/** A projective transform centered on the authored eye. Every transformed
 * point stays on its original view ray; all six planes remain planes. The
 * rear plane satisfies z = 5.2 + 1.7*x, rather than being a flat room with a
 * farther figure. Denominators stay positive throughout the closed box. */
export function distortRoomPoint(p: Vec3): Vec3 {
  const { referenceEye: e, depth, backZ, skew } = AMES_SPEC, denominator = backZ - skew * p.x;
  if (![p.x, p.y, p.z].every(Number.isFinite) || denominator <= 1e-8) throw new RangeError('Point outside finite Ames construction');
  const t = depth / denominator;
  return { x: e.x + (p.x - e.x) * t, y: e.y + (p.y - e.y) * t, z: e.z + (p.z - e.z) * t };
}
export function amesWorldPoint(p: Vec3): Vec3 { return { x: AMES_SPEC.worldOrigin.x - p.z, y: p.y, z: AMES_SPEC.worldOrigin.z + p.x }; }
const s = AMES_SPEC;
export const AMES_REFERENCE_VERTICES: readonly Vec3[] = [
  { x:s.minX,y:s.floorY,z:s.frontZ },{ x:s.maxX,y:s.floorY,z:s.frontZ },{ x:s.maxX,y:s.ceilingY,z:s.frontZ },{ x:s.minX,y:s.ceilingY,z:s.frontZ },
  { x:s.minX,y:s.floorY,z:s.backZ },{ x:s.maxX,y:s.floorY,z:s.backZ },{ x:s.maxX,y:s.ceilingY,z:s.backZ },{ x:s.minX,y:s.ceilingY,z:s.backZ },
];
export const AMES_VERTICES = AMES_REFERENCE_VERTICES.map(distortRoomPoint);
/** Consistent outward winding. Front is an opening (its four framing edges
 * retain this face); the mathematical closed box includes it for validation. */
export const AMES_FACES = [
  { id:'front',indices:[0,3,2,1] },{ id:'rear',indices:[4,5,6,7] },{ id:'floor',indices:[0,1,5,4] },
  { id:'ceiling',indices:[3,7,6,2] },{ id:'left',indices:[0,4,7,3] },{ id:'right',indices:[1,2,6,5] },
] as const;
export const AMES_PROP_PARTS = [
  { width:.22,height:.14,depth:.22,centerY:.07 },
  { width:.16,height:.50,depth:.16,centerY:.39 },
  { width:.20,height:.18,depth:.20,centerY:.73 },
] as const;
export const AMES_PROPS = [-.82,.82].map((x,i) => {
  const p = distortRoomPoint({ x, y: s.floorY, z: 5.65 });
  return { id: i ? 'ames-static-far' : 'ames-static-near', position: amesWorldPoint(p), scale: { x:1,y:1,z:1 }, size: { x:s.propWidth,y:s.propHeight,z:s.propDepth }, localPosition:p };
});
export const AMES_OBSERVATION_POINTS = {
  front: { position: { x:-4,y:1.6,z:7 }, yaw: Math.PI / 2, pitch:0 },
  intermediate: { position: { x:-4.3,y:1.6,z:7.45 }, yaw:1.5,pitch:0 },
  side: { position: { x:-11.45,y:1.6,z:10.3 }, yaw:-.6,pitch:-.12 },
};
