import type { CollisionVolume, FloorRegion, PlayerPose } from '../firstPerson/types';
import type { GalleryFixture } from '../gallery/types';
import type { VaultCheckpointId, VaultDevice } from './types';
export const VAULT_CHAPTER_ID = 'uncanny-vault-v1';
export const VAULT_LEVEL_VERSION = 1;
export const VAULT_SEED = 109;
export const VAULT_SPAWN: PlayerPose = { position: { x: -1.15, y: 1.6, z: -.7 }, yaw: Math.PI, pitch: 0 };
export const VAULT_LENGTH_POSE: PlayerPose = { position: { x: -1.15, y: 1.6, z: -.7 }, yaw: Math.PI, pitch: 0 };
export const VAULT_BRAKE_POSE: PlayerPose = { position: { x: -4.6, y: 1.6, z: 18.5 }, yaw: Math.PI / 2, pitch: 0 };
export const VAULT_EXIT_POSE: PlayerPose = { position: { x: 3, y: 1.6, z: 29 }, yaw: 0, pitch: 0 };
export const VAULT_CHECKPOINTS: Record<VaultCheckpointId, PlayerPose> = { entry: VAULT_SPAWN, brake: VAULT_BRAKE_POSE, exit: VAULT_EXIT_POSE };
export const VAULT_LENGTH_FIXTURE: GalleryFixture = { center: { x: -1.15, y: 1.7, z: 3.9 }, width: 2.25, height: 1.65,
  right: { x: -1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: -1 }, maxDistance: 4.9 };
export const VAULT_ROD_FIXTURE: GalleryFixture = { center: { x: -8.78, y: 1.7, z: 18.5 }, width: 1.8, height: 1.8,
  right: { x: 0, y: 0, z: -1 }, normal: { x: 1, y: 0, z: 0 }, maxDistance: 4.9 };
export const VAULT_CAFE_FIXTURE: GalleryFixture = { center: { x: -4.86, y: 1.8, z: 7 }, width: 1.8, height: .9,
  right: { x: 0, y: 0, z: -1 }, normal: { x: 1, y: 0, z: 0 }, maxDistance: 3.5 };
export const VAULT_EXIT_FIXTURE: GalleryFixture = { center: { x: 3, y: 1.4, z: 27.68 }, width: 2.4, height: 2.4,
  right: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, maxDistance: 3.3 };
export const VAULT_PARTITION_FIXTURE: GalleryFixture = { center: { x: 3.8, y: 1.4, z: 23.8 }, width: .65, height: 1.1,
  right: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, maxDistance: 2.6 };
export const vaultFixture = (puzzle: VaultDevice): GalleryFixture => puzzle === 'length' ? VAULT_LENGTH_FIXTURE : VAULT_ROD_FIXTURE;
export const VAULT_FLOORS: readonly FloorRegion[] = [
  { id: 'vault-repair-bay', minX: -3, maxX: 3, minZ: -2, maxZ: 5 },
  { id: 'vault-storage', minX: -5, maxX: 5, minZ: 5, maxZ: 20 },
  { id: 'vault-brake-bay', minX: -9, maxX: -4, minZ: 16, maxZ: 21 },
  { id: 'vault-egress', minX: 1.5, maxX: 4.5, minZ: 20, maxZ: 28 },
  { id: 'vault-safe-outside', minX: 1.5, maxX: 4.5, minZ: 28, maxZ: 31 },
];
const box = (id: string, x: number, z: number, width: number, depth: number, height = 3.1): CollisionVolume => ({
  id, kind: 'wall', opaque: true, min: { x: x - width / 2, y: 0, z: z - depth / 2 }, max: { x: x + width / 2, y: height, z: z + depth / 2 },
});
export const VAULT_SOLIDS: readonly CollisionVolume[] = [
  box('vault-entry-back', 0, -2, 6.2, .2), box('vault-entry-west', -3, 1.5, .2, 7), box('vault-entry-east', 3, 1.5, .2, 7),
  box('vault-repair-partition-west', -3, 5, 4, .25), box('vault-repair-partition-east', 3, 5, 4, .25),
  box('vault-west-wall-a', -5, 10.5, .2, 11), box('vault-west-wall-b', -5, 20.7, .2, .6), box('vault-east-wall', 5, 12.5, .2, 15),
  box('vault-storage-back-west', -1.8, 20, 6.4, .25), box('vault-storage-back-east', 4.85, 20, .3, .25),
  box('vault-central-rack', 0, 11.5, 3.2, 5.0, 2.45),
  box('vault-east-rack', 3.8, 15.5, 1.3, 2.5, 2.4),
  box('vault-west-rack', -3.45, 13.5, 1.3, 2.5, 2.4),
  box('vault-reveal-partition', 2.5, 7.65, 2.1, .2, 1.42),
  box('vault-brake-wall-west', -9, 18.5, .2, 5), box('vault-brake-wall-south', -6.5, 16, 5, .2), box('vault-brake-wall-north', -6.5, 21, 5, .2),
  // A visible 0.70 m access grille fits the player's footprint, but not this
  // actor's wider real shoulder/foot envelope. No invisible actor-only wall.
  box('vault-brake-grille-a', -4, 17.075, .18, 2.15), box('vault-brake-grille-b', -4, 19.925, .18, 2.15),
  box('vault-egress-west', 1.5, 25.5, .2, 11), box('vault-egress-east', 4.5, 25.5, .2, 11),
  box('vault-safe-back', 3, 31, 3.2, .2),
];

/** Actual flat metal surfaces. Their noise is a game event, not microphone or
 * successful speaker playback. Slow analog movement produces a weaker event. */
export const VAULT_METAL_FLOORS: readonly FloorRegion[] = [
  { id: 'vault-west-metal', minX: -2.65, maxX: -1.8, minZ: 7.2, maxZ: 8.6 },
  { id: 'vault-east-metal', minX: 1.8, maxX: 2.8, minZ: 15.5, maxZ: 16.8 },
  { id: 'vault-egress-metal', minX: 2.1, maxX: 3.9, minZ: 25, maxZ: 26 },
];
