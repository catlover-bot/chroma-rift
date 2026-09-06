import type { CollisionVolume, FloorRegion, PlayerPose } from '../firstPerson/types';
import type { GalleryDevice, GalleryFixture } from './types';

export const GALLERY_CHAPTER_ID = 'perception-gallery-v1';
export const GALLERY_LEVEL_VERSION = 3;
export const GALLERY_SEED = 73;
export const GALLERY_SPAWN: PlayerPose = { position: { x: 0, y: 1.6, z: 2 }, yaw: Math.PI, pitch: 0 };
export const GALLERY_A_OBSERVATION_POSE: PlayerPose = { position: { x: 1.95, y: 1.6, z: -4.9 }, yaw: 0, pitch: 0 };
export const GALLERY_SHADOW_OBSERVATION_POSE: PlayerPose = { position: { x: -7, y: 1.6, z: -10.7 }, yaw: 0, pitch: 0 };
export const GALLERY_CONTOUR_OBSERVATION_POSE: PlayerPose = { position: { x: 9, y: 1.6, z: -10.7 }, yaw: 0, pitch: 0 };
export const GALLERY_OBSERVATION_POSE: PlayerPose = { position: { x: 0, y: 1.6, z: -19.5 }, yaw: 0, pitch: 0 };
export const GALLERY_EMBLEM_FIXTURE = { center: { x: 1.95, y: 2.02, z: -7.81 }, width: 1.4, height: 1.4, frameWidth: 1.56, frameHeight: 1.56,
  maxDistance: 3.4, normal: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 } } as const;
export const GALLERY_EMBLEM_SWITCHES = [
  { glyph: 'circle', id: 'emblem-circle', center: { x: 1.4, y: 1.04, z: -7.745 }, width: 0.34, height: 0.34, maxDistance: 3.4 },
  { glyph: 'diamond', id: 'emblem-diamond', center: { x: 1.95, y: 1.04, z: -7.745 }, width: 0.34, height: 0.34, maxDistance: 3.4 },
  { glyph: 'square', id: 'emblem-square', center: { x: 2.5, y: 1.04, z: -7.745 }, width: 0.34, height: 0.34, maxDistance: 3.4 },
] as const;
export const GALLERY_EMBLEM_LATCH = { center: { x: 1.08, y: 1.28, z: -7.73 }, width: 0.3, height: 0.06, depth: 0.07, travel: 0.18 } as const;
export const GALLERY_SHADOW_FIXTURE: GalleryFixture = { center: { x: -7, y: 1.75, z: -15.78 }, width: 2.4, height: 1.8, normal: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, maxDistance: 5.3 };
export const GALLERY_CONTOUR_FIXTURE: GalleryFixture = { ...GALLERY_SHADOW_FIXTURE, center: { x: 9, y: 1.75, z: -15.78 } };
export const GALLERY_WIRING_FIXTURE: GalleryFixture = { center: { x: -5.78, y: 1.75, z: 9.8 }, width: 2.4, height: 1.8, normal: { x: 1, y: 0, z: 0 }, right: { x: 0, y: 0, z: -1 }, maxDistance: 5.3 };
export const GALLERY_WIRING_OBSERVATION_POSE: PlayerPose = { position: { x: -1.2, y: 1.6, z: 9.8 }, yaw: Math.PI / 2, pitch: 0 };
export const GALLERY_MASK_FIXTURE: GalleryFixture = { center: { x: 2.25, y: 1.8, z: -5 }, width: .8002294, height: 1, normal: { x: -1, y: 0, z: 0 }, right: { x: 0, y: 0, z: 1 }, maxDistance: 3.4 };
export const GALLERY_MASK_WINDOW_FIXTURE: GalleryFixture = { center: { x: 2.56, y: 1.8, z: -4.43 }, width: .62, height: 1.2, normal: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, maxDistance: 2.3 };
export const GALLERY_MASK_SIDE_POSE: PlayerPose = { position: { x: 1.7, y: 1.6, z: -3.6 }, yaw: 0, pitch: 0 };
export const GALLERY_HYBRID_FIXTURE: GalleryFixture = { center: { x: -2.78, y: 1.8, z: -6.5 }, width: 1.25, height: 1.25, normal: { x: 1, y: 0, z: 0 }, right: { x: 0, y: 0, z: -1 }, maxDistance: 5.3 };
export function fixtureForPuzzle(puzzle: GalleryDevice): GalleryFixture { return puzzle === 'shadow' ? GALLERY_SHADOW_FIXTURE : puzzle === 'contour' ? GALLERY_CONTOUR_FIXTURE : GALLERY_WIRING_FIXTURE; }
export const GALLERY_CHANGED_REGION: CollisionVolume = { id: 'gallery-changed-entrance', min: { x: -5.2, y: -0.25, z: 6 }, max: { x: 5.2, y: 3.4, z: 17.2 }, kind: 'wall', opaque: true };
// The same authored volumes serve rendering, collision and later actor routing.
export const GALLERY_LIGHT_FIXTURE: GalleryFixture = { center: { x: -0.72, y: 1.55, z: 5.78 }, width: 0.64, height: 0.9, maxDistance: 4.1, normal: { x: 0, y: 0, z: -1 }, right: { x: -1, y: 0, z: 0 } };
export const GALLERY_EXIT_PANEL_FIXTURE: GalleryFixture = { ...GALLERY_LIGHT_FIXTURE, center: { x: 0.72, y: 1.55, z: 5.78 } };
export const GALLERY_CHROMATIC_FIXTURE: GalleryFixture = { center: { x: -2.78, y: 1.75, z: -2 }, width: 1.2, height: 1.2, maxDistance: 3.4, normal: { x: 1, y: 0, z: 0 }, right: { x: 0, y: 0, z: -1 } };
export const GALLERY_DISPLAY_POSITION = { x: -.55, y: 0, z: 9 } as const;
export const GALLERY_SERVICE_CHECKPOINT: PlayerPose = { position: { x: 0, y: 1.6, z: 7 }, yaw: Math.PI, pitch: 0 };
export const GALLERY_FINAL_CHECKPOINT: PlayerPose = { position: { x: 4, y: 1.6, z: 24 }, yaw: Math.PI, pitch: 0 };
export const GALLERY_OUTSIDE_POSE: PlayerPose = { position: { x: 4, y: 1.6, z: 24.6 }, yaw: Math.PI, pitch: 0 };
export const GALLERY_FINAL_DOOR_FIXTURE: GalleryFixture = { center: { x: 4, y: 1.45, z: 23.08 }, width: 1.5, height: 2.6, maxDistance: 2.4, normal: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 } };
export const GALLERY_SAFE_RETREATS: readonly PlayerPose[] = [
  { position: { x: 1.7, y: 1.6, z: 13.8 }, yaw: -Math.PI / 2, pitch: 0 },
  { position: { x: 6.3, y: 1.6, z: 18.8 }, yaw: Math.PI / 2, pitch: 0 },
];
export const GALLERY_FLOORS: readonly FloorRegion[] = [
  { id: 'gallery-entrance', minX: -3, maxX: 3, minZ: 0, maxZ: 6 },
  { id: 'gallery-introduction', minX: -3, maxX: 3, minZ: -8, maxZ: 0 },
  { id: 'gallery-hub', minX: -4, maxX: 4, minZ: -14, maxZ: -8 },
  { id: 'gallery-shadow', minX: -10, maxX: -4, minZ: -16, maxZ: -8 },
  { id: 'gallery-contour', minX: 6, maxX: 12, minZ: -16, maxZ: -8 },
  { id: 'gallery-east-link', minX: 4, maxX: 6, minZ: -11, maxZ: -9 },
  { id: 'gallery-service-threshold', minX: -1, maxX: 1, minZ: 6, maxZ: 10 },
  { id: 'gallery-service-turn', minX: -1, maxX: 5, minZ: 8, maxZ: 10 },
  { id: 'gallery-maintenance-bay', minX: -6, maxX: 1, minZ: 6, maxZ: 13 },
  { id: 'gallery-service-corridor', minX: 3, maxX: 5, minZ: 8, maxZ: 23 },
  { id: 'gallery-retreat-west', minX: 1, maxX: 3, minZ: 12, maxZ: 16 },
  { id: 'gallery-retreat-east', minX: 5, maxX: 7, minZ: 17, maxZ: 21 },
  { id: 'gallery-outside', minX: 3, maxX: 5, minZ: 23, maxZ: 26 },
];
export const GALLERY_CHECKPOINT_POSES: readonly PlayerPose[] = [GALLERY_SPAWN,
  { position: { x: 0, y: 1.6, z: -4.9 }, yaw: 0, pitch: 0 },
  { position: { x: 0, y: 1.6, z: -10 }, yaw: 0, pitch: 0 },
  GALLERY_SHADOW_OBSERVATION_POSE, GALLERY_CONTOUR_OBSERVATION_POSE,
  GALLERY_SERVICE_CHECKPOINT, GALLERY_WIRING_OBSERVATION_POSE, ...GALLERY_SAFE_RETREATS, GALLERY_FINAL_CHECKPOINT, GALLERY_OUTSIDE_POSE,
];
export const GALLERY_CHAPTER = {
  id: GALLERY_CHAPTER_ID, version: GALLERY_LEVEL_VERSION, title: '閉館後の展示室', seed: GALLERY_SEED,
  spawn: GALLERY_SPAWN, checkpoints: GALLERY_CHECKPOINT_POSES, rooms: GALLERY_FLOORS,
  fixtureIds: ['gallery-light', 'gallery-exit-panel', 'shadow-panel', 'contour-panel', 'shadow-power', 'contour-power', 'wiring-panel', 'mask-exhibit', 'mask-window', 'hybrid-exhibit', 'exit'],
  gates: { 'gallery-service-door': ['powerConnected'], 'wiring-shutter': ['powerConnected', 'wiring.solved'], 'exit-door': ['wiring.solved', 'explicitClose'] },
  checkpointSchemaVersion: 3,
} as const;
