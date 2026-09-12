import { stageModule } from '../stageKit/modules';
import { EMBLEM_FIXTURE, EMBLEM_FIXTURE_SOLIDS, EMBLEM_SWITCHES } from './emblemFixture';
import { boundaryWalls, box } from './boundaryWalls';
import { FLOOR_PUZZLE, FRAME_CENTER, KEY_FRAGMENTS, KEY_FRAME, KEY_PUZZLE, ROOMS } from './legacyDefinition';
import type { ChapterRuntime, FloorRegion, WorldGeometry } from './types';

export * from './constants';
export { CHAPTER_ID, LEVEL_VERSION, FLOOR_MARK, GUIDE_FIXTURE, OBSERVATION_POSE, CHANGED_REGION, VARIANT_SAFE_REGION, FLOOR_PUZZLE, KEY_PUZZLE, CHAPTER, KEY_FRAME, KEY_FRAGMENTS } from './legacyDefinition';
export { boundaryWalls } from './boundaryWalls';
const region = (id: string, minX: number, maxX: number, minZ: number, maxZ: number): FloorRegion => ({ id, minX, maxX, minZ, maxZ });

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

export function getWorld(runtime: ChapterRuntime): WorldGeometry {
  const module = stageModule(runtime.chapterId);
  if (module) return module.world(runtime);
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
