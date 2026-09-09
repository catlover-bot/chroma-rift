import { actorMotionEye } from '../actorMotion/pose';
import { ACTOR_COLLISION_RADIUS, ACTOR_MODEL_BOUNDS } from '../actorMotion/envelope';
import { clamp, segmentOccluded } from '../firstPerson/geometry';
import type { Vec3, WorldGeometry } from '../firstPerson/types';
import type { VaultActor, VaultNoise } from './types';

export const VAULT_AI = Object.freeze({
  patrolSpeed: .72, investigateSpeed: 1.0, pursueSpeed: 2.35, searchSpeed: .62,
  visionRange: 6.4, visionHalfAngle: 52 * Math.PI / 180, recognitionSeconds: .45,
  noiseThreshold: .22, noiseRange: 7, occludedNoiseGain: .28,
  revealSeconds: 1.4, noticeSeconds: .65, windupSeconds: .75, attackSeconds: .42, recoverSeconds: .95,
  searchSeconds: 4.2, returnPause: .6, contactDistance: .68, coldGrace: 3, repathSeconds: .35,
});
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
function bodyAllowed(position: Vec3, world: WorldGeometry): boolean {
  if (![position.x, position.y, position.z].every(Number.isFinite)) return false;
  for (let i = -1; i < 16; i++) {
    const x = position.x + (i < 0 ? 0 : Math.cos(i * Math.PI / 8) * ACTOR_COLLISION_RADIUS);
    const z = position.z + (i < 0 ? 0 : Math.sin(i * Math.PI / 8) * ACTOR_COLLISION_RADIUS);
    if (!world.floors.some(floor => x >= floor.minX && x <= floor.maxX && z >= floor.minZ && z <= floor.maxZ)) return false;
  }
  return !world.solids.some(solid => {
    if (solid.id === 'vault-actor-body' || solid.max.y <= 0 || solid.min.y >= ACTOR_MODEL_BOUNDS.height) return false;
    const dx = position.x - clamp(position.x, solid.min.x, solid.max.x), dz = position.z - clamp(position.z, solid.min.z, solid.max.z);
    return dx * dx + dz * dz < ACTOR_COLLISION_RADIUS ** 2 - 1e-8;
  });
}
export function vaultActorEdgeOpen(from: Vec3, to: Vec3, world: WorldGeometry): boolean {
  const steps = Math.max(1, Math.ceil(distance(from, to) / (ACTOR_COLLISION_RADIUS / 4)));
  for (let i = 0; i <= steps; i++) if (!bodyAllowed({ x: from.x + (to.x - from.x) * i / steps, y: 0, z: from.z + (to.z - from.z) * i / steps }, world)) return false;
  return true;
}
/** A game event, never an audio preference or microphone observation. */
export function vaultNoiseAudibility(actor: VaultActor, noise: VaultNoise, world: WorldGeometry): number {
  if (!Number.isSafeInteger(noise.sequence) || noise.sequence < 0 || !['footstep', 'metal'].includes(noise.kind) || ![noise.position.x, noise.position.y, noise.position.z, noise.strength].every(Number.isFinite) || noise.strength <= 0) return 0;
  const ear = actorMotionEye(actor.motion).position, range = distance(ear, noise.position);
  if (range > VAULT_AI.noiseRange) return 0;
  return Math.min(1.2, noise.strength) / (1 + range * .6) * (segmentOccluded(ear, noise.position, world) ? VAULT_AI.occludedNoiseGain : 1);
}
