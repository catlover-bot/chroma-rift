import { CEILING_BASE_Y, CEILING_THICKNESS, EYE_HEIGHT, FLOOR_THICKNESS } from './constants';
import type { ChapterDefinition, CollisionVolume, FloorRegion, KeyFragment, KeyFrame, PlayerPose, PuzzleDefinition, Vec3 } from './types';

export const CHAPTER_ID = 'returnless-entrance';
export const LEVEL_VERSION = 1;
export const FLOOR_MARK = { x: 0, y: 0, z: -4 };
export const GUIDE_FIXTURE = { center: { x: 0, y: 1.05, z: -0.7 }, radius: 0.22, diameter: 0.44 } as const;
export const OBSERVATION_POSE: PlayerPose = { position: { x: 8, y: EYE_HEIGHT, z: -13.5 }, yaw: 0, pitch: 0 };
export const CHANGED_REGION: CollisionVolume = { id: 'changed-entrance', min: { x: -5.2, y: -FLOOR_THICKNESS - 0.01, z: 6 }, max: { x: 5.2, y: CEILING_BASE_Y + CEILING_THICKNESS, z: 17.2 }, kind: 'wall', opaque: true };
export const VARIANT_SAFE_REGION: FloorRegion = { id: 'occluded-observation-bay', minX: 7.6, maxX: 8.4, minZ: -14, maxZ: -13.2 };

const region = (id: string, minX: number, maxX: number, minZ: number, maxZ: number): FloorRegion => ({ id, minX, maxX, minZ, maxZ });
export const ROOMS: readonly FloorRegion[] = [
  region('entrance-hall', -3, 3, 0, 6),
  region('unbroken-floor', -3, 3, -8, 0),
  region('north-passage', -1, 1, -10, -8),
  region('dogleg-passage', -1, 6, -12, -10),
  region('overlapping-key', 4, 12, -22, -12),
  region('quiet-alcove', 2, 4, -18, -16),
  region('return-passage', 10, 12, -12, -5),
  region('return-turn', 3, 12, -5, -3),
];
const SPAWN: PlayerPose = { position: { x: 0, y: EYE_HEIGHT, z: 7 }, yaw: 0, pitch: 0 };
export const FLOOR_PUZZLE: PuzzleDefinition = {
  id: 'untouchable-emblem', title: '触れない紋章',
  prerequisites: [],
  clues: ['切れずにつながる輪郭を探す', '色ではなく、線のつながりを確かめよう。'],
  action: { type: 'inspect', target: 'emblem-panel' },
  success: { seal: 'sealA', opensDoor: 'seal-a-door' },
  hints: ['浮いて見えるかより、線がどこへ続くかを見てみよう。', '二つの輪郭のうち、一つには切れ目がある。「色をほどく」で比べられる。', '切れずに一周できる輪郭と、同じ形の印を押そう。「輪郭ガイド」でも確認できる。'],
};
export const KEY_PUZZLE: PuzzleDefinition = {
  id: 'overlapping-key', title: '重なる鍵',
  prerequisites: ['sealA', 'keyAlignment'],
  clues: ['欠けた形は、ここから見る。', '足元の印と、奥の額縁を確かめよう。'],
  action: { type: 'align', target: 'key' },
  success: { seal: 'sealB', opensDoor: 'seal-b-door' },
  hints: ['回廊の先で、欠けた鍵の形を探そう。', '欠けた形は、足元の印から見る。', '鍵の部屋の輪に立ち、額縁を正面に見よう。「視点を合わせる」も使えます。'],
};
export const CHAPTER: ChapterDefinition = {
  id: CHAPTER_ID, version: LEVEL_VERSION, title: '帰り道のない入口', spawn: SPAWN, rooms: ROOMS,
  puzzles: [FLOOR_PUZZLE, KEY_PUZZLE],
  checkpoints: [
    SPAWN,
    { position: { x: 0, y: EYE_HEIGHT, z: 2 }, yaw: 0, pitch: 0 },
    { position: { x: 0, y: EYE_HEIGHT, z: -5 }, yaw: 0, pitch: 0 },
    { position: { x: 5, y: EYE_HEIGHT, z: -13 }, yaw: -Math.PI / 2, pitch: 0 },
    OBSERVATION_POSE,
    { position: { x: 11, y: EYE_HEIGHT, z: -6 }, yaw: Math.PI / 2, pitch: 0 },
    { position: { x: 0, y: EYE_HEIGHT, z: 10 }, yaw: Math.PI, pitch: 0 },
    { position: { x: 0, y: EYE_HEIGHT, z: 15.5 }, yaw: Math.PI, pitch: 0 },
  ],
};

// Define the desired outline on a far plane first; move each portion towards
// the design camera along its view ray. Actual R3F matrices judge alignment.
export const FRAME_CENTER: Vec3 = { x: 8, y: EYE_HEIGHT, z: -20 };
const OUTLINES = [
  [[-0.48, 0.45], [-0.27, 0.75], [0.25, 0.75], [0.48, 0.45], [0.48, 0.18], [0.25, -0.08], [-0.27, -0.08], [-0.48, 0.18], [-0.48, 0.45]],
  [[0, -0.08], [0, -0.95]],
  [[0, -0.55], [0.38, -0.55], [0.38, -0.78], [0, -0.78]],
];
export const KEY_FRAME: KeyFrame = {
  center: FRAME_CENTER, width: 3, height: 2.6,
  outline: OUTLINES.map((outline) => outline.map(([x, y]) => ({ x: FRAME_CENTER.x + x!, y: FRAME_CENTER.y + y!, z: FRAME_CENTER.z }))),
};
export const KEY_FRAGMENTS: readonly KeyFragment[] = KEY_FRAME.outline.map((outline, index) => {
  const ratio = [3, 4.5, 6][index]! / 6.5;
  const camera = OBSERVATION_POSE.position;
  return { id: `key-fragment-${index + 1}`, strokeWidth: 0.045 * ratio,
    points: outline.map((point) => ({ x: camera.x + (point.x - camera.x) * ratio, y: camera.y + (point.y - camera.y) * ratio, z: camera.z + (point.z - camera.z) * ratio })) };
});
