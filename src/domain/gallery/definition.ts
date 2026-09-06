import type { CollisionVolume, FloorRegion, PlayerPose } from '../firstPerson/types';
import type { GalleryFixture, GalleryPuzzle } from './types';

export const GALLERY_CHAPTER_ID = 'perception-gallery-v1';
export const GALLERY_LEVEL_VERSION = 1;
export const GALLERY_SEED = 73;
export const GALLERY_SPAWN: PlayerPose = { position: { x: 0, y: 1.6, z: 7 }, yaw: 0, pitch: 0 };
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
export function fixtureForPuzzle(puzzle: GalleryPuzzle): GalleryFixture { return puzzle === 'shadow' ? GALLERY_SHADOW_FIXTURE : GALLERY_CONTOUR_FIXTURE; }
export const GALLERY_CHANGED_REGION: CollisionVolume = { id: 'gallery-changed-entrance', min: { x: -5.2, y: -0.25, z: 6 }, max: { x: 5.2, y: 3.4, z: 17.2 }, kind: 'wall', opaque: true };
export const GALLERY_FLOORS: readonly FloorRegion[] = [
  { id: 'gallery-entrance', minX: -3, maxX: 3, minZ: 0, maxZ: 6 },
  { id: 'gallery-emblem', minX: -3, maxX: 3, minZ: -8, maxZ: 0 },
  { id: 'gallery-hub', minX: -4, maxX: 4, minZ: -14, maxZ: -8 },
  { id: 'gallery-shadow', minX: -10, maxX: -4, minZ: -16, maxZ: -8 },
  { id: 'gallery-contour', minX: 6, maxX: 12, minZ: -16, maxZ: -8 },
  { id: 'gallery-east-link', minX: 4, maxX: 6, minZ: -11, maxZ: -9 },
  { id: 'gallery-key-passage', minX: 1, maxX: 3, minZ: -18, maxZ: -14 },
  { id: 'gallery-key', minX: -4, maxX: 4, minZ: -28, maxZ: -18 },
  { id: 'gallery-return', minX: 4, maxX: 6, minZ: -22, maxZ: -3 },
  { id: 'gallery-return-turn', minX: 3, maxX: 6, minZ: -5, maxZ: -3 },
];
export const GALLERY_CHECKPOINT_POSES: readonly PlayerPose[] = [GALLERY_SPAWN,
  { position: { x: 0, y: 1.6, z: 2 }, yaw: 0, pitch: 0 }, GALLERY_A_OBSERVATION_POSE,
  { position: { x: 0, y: 1.6, z: -10 }, yaw: 0, pitch: 0 },
  GALLERY_SHADOW_OBSERVATION_POSE, GALLERY_CONTOUR_OBSERVATION_POSE, GALLERY_OBSERVATION_POSE,
  { position: { x: 5, y: 1.6, z: -19 }, yaw: Math.PI, pitch: 0 },
  { position: { x: 0, y: 1.6, z: 10 }, yaw: Math.PI, pitch: 0 },
  { position: { x: 0, y: 1.6, z: 15.5 }, yaw: Math.PI, pitch: 0 },
];
export const GALLERY_CHAPTER = {
  id: GALLERY_CHAPTER_ID, version: GALLERY_LEVEL_VERSION, title: '不確かな展示室', seed: GALLERY_SEED,
  spawn: GALLERY_SPAWN, checkpoints: GALLERY_CHECKPOINT_POSES, rooms: GALLERY_FLOORS,
  fixtureIds: ['emblem-panel', 'shadow-panel', 'contour-panel', 'key', 'exit'],
  gates: { 'seal-a-door': ['A'], 'gallery-key-door': ['B', 'C'], 'gallery-shadow-shortcut': ['B'], 'gallery-contour-shortcut': ['C'], 'seal-b-door': ['D'], 'gallery-return-door': ['D'], 'exit-door': ['A', 'B', 'C', 'D', 'return'] },
  landmarkIds: ['remembered-door-left', 'remembered-door-right', 'gallery-double-column', 'gallery-notched-frame'],
  changedRegion: GALLERY_CHANGED_REGION, checkpointSchemaVersion: 1,
} as const;
