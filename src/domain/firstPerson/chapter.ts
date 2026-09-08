import { getVaultWorld } from '../vault/world';
import { getGalleryWorld } from '../gallery/world';
import { EMBLEM_FIXTURE, EMBLEM_FIXTURE_SOLIDS, EMBLEM_SWITCHES } from './emblemFixture';
import type { ChapterDefinition, ChapterRuntime, CollisionVolume, FloorRegion, KeyFragment, KeyFrame, PlayerPose, PuzzleDefinition, Vec3, WorldGeometry } from './types';

export const CHAPTER_ID = 'returnless-entrance';
export const LEVEL_VERSION = 1;
export const EYE_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.24;
export const PLAYER_HEIGHT = 1.82;
export const VERTICAL_FOV = 65;
export const CAMERA_NEAR = 0.08;
export const CAMERA_FAR = 60;
export const FLOOR_THICKNESS = 0.24;
export const CEILING_BASE_Y = 3.2;
export const CEILING_THICKNESS = 0.2;
export const FLOOR_MARK = { x: 0, y: 0, z: -4 };
export const GUIDE_FIXTURE = { center: { x: 0, y: 1.05, z: -0.7 }, radius: 0.22, diameter: 0.44 } as const;
export const OBSERVATION_POSE: PlayerPose = { position: { x: 8, y: EYE_HEIGHT, z: -13.5 }, yaw: 0, pitch: 0 };
export const CHANGED_REGION: CollisionVolume = { id: 'changed-entrance', min: { x: -5.2, y: -FLOOR_THICKNESS - 0.01, z: 6 }, max: { x: 5.2, y: CEILING_BASE_Y + CEILING_THICKNESS, z: 17.2 }, kind: 'wall', opaque: true };
export const VARIANT_SAFE_REGION: FloorRegion = { id: 'occluded-observation-bay', minX: 7.6, maxX: 8.4, minZ: -14, maxZ: -13.2 };

const region = (id: string, minX: number, maxX: number, minZ: number, maxZ: number): FloorRegion => ({ id, minX, maxX, minZ, maxZ });
const ROOMS: readonly FloorRegion[] = [
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
const FRAME_CENTER: Vec3 = { x: 8, y: EYE_HEIGHT, z: -20 };
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

function box(id: string, minX: number, maxX: number, minZ: number, maxZ: number, kind: CollisionVolume['kind'] = 'wall', minY = 0, maxY = 3.2): CollisionVolume {
  return { id, min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, kind, opaque: true };
}

// Small integer-grid room union: merge exposed boundary edges into long walls.
// This only constructs the authored chapter, not a maze generator or scene editor.
export function boundaryWalls(floors: readonly FloorRegion[], omitRememberedSeam = true): CollisionVolume[] {
  const cells = new Set<string>();
  for (const floor of floors) for (let x = floor.minX; x < floor.maxX; x += 1) for (let z = floor.minZ; z < floor.maxZ; z += 1) cells.add(`${x},${z}`);
  const lines = new Map<string, number[]>();
  const add = (axis: 'x' | 'z', fixed: number, start: number) => {
    const key = `${axis}:${fixed}`;
    const values = lines.get(key) ?? [];
    values.push(start); lines.set(key, values);
  };
  for (const cell of cells) {
    const [x, z] = cell.split(',').map(Number) as [number, number];
    if (!cells.has(`${x - 1},${z}`)) add('x', x, z);
    if (!cells.has(`${x + 1},${z}`)) add('x', x + 1, z);
    if (!cells.has(`${x},${z - 1}`)) add('z', z, x);
    if (!cells.has(`${x},${z + 1}`)) add('z', z + 1, x);
  }
  const walls: CollisionVolume[] = [];
  for (const [line, values] of lines) {
    const [axis, fixedText] = line.split(':');
    const fixed = Number(fixedText);
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length;) {
      const start = sorted[i]!;
      let end = start + 1;
      i += 1;
      while (sorted[i] === end) { end += 1; i += 1; }
      // The remembered doorway partition below owns the seam at z=6.
      if (omitRememberedSeam && axis === 'z' && fixed === 6) continue;
      const id = `boundary-${axis}-${fixed}-${start}-${end}`;
      walls.push(axis === 'x' ? box(id, fixed - 0.1, fixed + 0.1, start, end) : box(id, start, end, fixed - 0.1, fixed + 0.1));
    }
  }
  return walls;
}

const FIXED_WALLS = [
  box('remembered-door-left', -5.2, -1, 5.9, 6.1),
  box('remembered-door-right', 1, 5.2, 5.9, 6.1),
  box('floor-room-door-left', -3, -1, -0.1, 0.1),
  box('floor-room-door-right', 1, 3, -0.1, 0.1),
];
const layouts = {
  entrance: [...ROOMS, region('small-vestibule', -1, 1, 6, 8)],
  exit: [...ROOMS, region('expanded-exit', -5, 5, 6, 14), region('outside', -1, 1, 14, 17)],
} as const;
const staticWalls = { entrance: [...boundaryWalls(layouts.entrance), ...FIXED_WALLS], exit: [...boundaryWalls(layouts.exit), ...FIXED_WALLS] };

export function getWorld(runtime: Pick<ChapterRuntime, 'progress' | 'doorAOpen' | 'doorBOpen' | 'doorExitOpen' | 'alignment' | 'gallery' | 'vault'>): WorldGeometry {
  if (runtime.progress.vault) return getVaultWorld(runtime);
  if (runtime.progress.gallery) return getGalleryWorld(runtime);
  const { progress } = runtime;
  const solids = [...staticWalls[progress.variant],
    box(FLOOR_PUZZLE.success.opensDoor, -1, 1, -8.12, -7.92, 'door', runtime.doorAOpen * 3.3, 3.2 + runtime.doorAOpen * 3.3),
    box(KEY_PUZZLE.success.opensDoor, 10, 12, -12.12, -11.92, 'door', runtime.doorBOpen * 3.3, 3.2 + runtime.doorBOpen * 3.3),
    ...EMBLEM_FIXTURE_SOLIDS,
    ...(progress.variant === 'exit' ? [box('exit-door', -1, 1, 13.92, 14.12, 'door', runtime.doorExitOpen * 3.3, 3.2 + runtime.doorExitOpen * 3.3)] : []),
  ];
  const interactables: WorldGeometry['interactables'] = [
    { id: 'emblem-panel', label: '触れない紋章', center: EMBLEM_FIXTURE.center, radius: 0.01, maxDistance: EMBLEM_FIXTURE.maxDistance, rectangle: { width: EMBLEM_FIXTURE.width, height: EMBLEM_FIXTURE.height, normal: EMBLEM_FIXTURE.normal, right: EMBLEM_FIXTURE.right } },
    ...EMBLEM_SWITCHES.map((item) => ({ id: item.id, label: item.glyph === 'circle' ? '丸の印' : item.glyph === 'diamond' ? 'ひし形の印' : '四角の印', center: item.center, radius: item.width / 2, maxDistance: item.maxDistance })),
    { id: 'key', label: runtime.alignment && !progress.sealB ? '重ねる' : progress.sealB ? '重なった鍵' : '欠けた鍵', center: FRAME_CENTER, radius: 0.48, maxDistance: 8 },
    ...(progress.variant === 'exit' ? [{ id: 'exit' as const, label: '最後の扉', center: { x: 0, y: 1.4, z: 13.8 }, radius: 0.55, maxDistance: 2.2 }] : []),
  ];
  return { variant: progress.variant, floors: layouts[progress.variant], solids, interactables,
    colorPanels: [], keyFragments: KEY_FRAGMENTS, keyFrame: KEY_FRAME };
}
