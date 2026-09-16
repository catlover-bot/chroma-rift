import type { CollisionVolume } from '../../firstPerson/types';

/** Closed door coordinates. The complete slab blocks bodies, while only the
 * authored steel and mullions block sight through its observation window. */
export const CONTAINMENT_DOOR_BOUNDS = {
  min: { x: .8, y: 0, z: 15 }, max: { x: 4.3, y: 3.5, z: 15.18 },
} as const;
export const CONTAINMENT_DOOR_ORIGIN = {
  x: (CONTAINMENT_DOOR_BOUNDS.min.x + CONTAINMENT_DOOR_BOUNDS.max.x) / 2,
  y: CONTAINMENT_DOOR_BOUNDS.max.y / 2,
  z: (CONTAINMENT_DOOR_BOUNDS.min.z + CONTAINMENT_DOOR_BOUNDS.max.z) / 2,
} as const;
export const CONTAINMENT_DOOR_PARTS = [
  { id: 'containment-door-part-lower-steel', surface: 'steel', center: [0, -1.15, 0], size: [3.5, 1.2, .18] },
  { id: 'containment-door-part-upper-steel', surface: 'steel', center: [0, 1.35, 0], size: [3.5, .8, .18] },
  { id: 'containment-door-part-observation-pane', surface: 'glass', center: [0, .05, 0], size: [3.5, 1.8, .14] },
  ...[-1.7, -.57, .57, 1.7].map((x, index) => ({ id: `containment-door-part-mullion-${index}`, surface: 'metal' as const,
    center: [x, 0, 0] as const, size: [.065, 3.5, .18] as const })),
  { id: 'containment-door-part-bottom-seal', surface: 'rubber', center: [0, -1.71, 0], size: [3.5, .08, .18] },
] as const;

export function containmentDoorBottom(progress: number): number {
  return CONTAINMENT_DOOR_BOUNDS.max.y * (1 - Math.max(0, Math.min(1, progress)));
}
export function containmentDoorSolids(progress: number): CollisionVolume[] {
  const bottom = containmentDoorBottom(progress), origin = CONTAINMENT_DOOR_ORIGIN;
  return [{ id: 'containment-door', min: { ...CONTAINMENT_DOOR_BOUNDS.min, y: bottom },
    max: { ...CONTAINMENT_DOOR_BOUNDS.max, y: bottom + CONTAINMENT_DOOR_BOUNDS.max.y }, kind: 'door', opaque: false },
  ...CONTAINMENT_DOOR_PARTS.filter(part => part.surface !== 'glass').map(part => {
    const [x, y, z] = part.center, [width, height, depth] = part.size;
    // Clamp roundoff at the shared slab boundary: sight detail must never
    // enlarge the pre-existing body collider by even one floating-point ulp.
    return { id: part.id, min: { x: Math.max(CONTAINMENT_DOOR_BOUNDS.min.x, origin.x + x - width / 2),
      y: Math.max(bottom, bottom + origin.y + y - height / 2), z: Math.max(CONTAINMENT_DOOR_BOUNDS.min.z, origin.z + z - depth / 2) },
      max: { x: Math.min(CONTAINMENT_DOOR_BOUNDS.max.x, origin.x + x + width / 2),
        y: Math.min(bottom + CONTAINMENT_DOOR_BOUNDS.max.y, bottom + origin.y + y + height / 2),
        z: Math.min(CONTAINMENT_DOOR_BOUNDS.max.z, origin.z + z + depth / 2) },
      kind: 'door' as const, opaque: true };
  })];
}
