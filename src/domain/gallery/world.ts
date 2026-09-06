import { boundaryWalls, KEY_FRAME, KEY_FRAGMENTS } from '../firstPerson/chapter';
import type { ChapterRuntime, CollisionVolume, FloorRegion, KeyFragment, KeyFrame, WorldGeometry } from '../firstPerson/types';
import { GALLERY_CHAPTER_ID, GALLERY_CONTOUR_FIXTURE, GALLERY_EMBLEM_FIXTURE, GALLERY_EMBLEM_LATCH, GALLERY_EMBLEM_SWITCHES, GALLERY_FLOORS, GALLERY_OBSERVATION_POSE, GALLERY_SHADOW_FIXTURE } from './definition';

const box = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, kind: CollisionVolume['kind'] = 'wall', minY = 0, maxY = 3.2): CollisionVolume => ({ id, min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, kind, opaque: true });
const layouts: Record<'entrance' | 'exit', readonly FloorRegion[]> = {
  entrance: [...GALLERY_FLOORS, { id: 'gallery-small-vestibule', minX: -1, maxX: 1, minZ: 6, maxZ: 8 }],
  exit: [...GALLERY_FLOORS, { id: 'gallery-expanded-exit', minX: -5, maxX: 5, minZ: 6, maxZ: 14 }, { id: 'gallery-outside', minX: -1, maxX: 1, minZ: 14, maxZ: 17 }],
};
const fixed = [
  box('remembered-door-left', -5.2, -1, 5.9, 6.1), box('remembered-door-right', 1, 5.2, 5.9, 6.1),
  box('gallery-a-partition-left', -3, -1, -8.12, -7.92), box('gallery-a-partition-right', 1, 3, -8.12, -7.92),
  box('gallery-b-spine-north', -4.1, -3.9, -14, -13.4), box('gallery-b-spine-middle', -4.1, -3.9, -11.8, -10.5), box('gallery-b-spine-south', -4.1, -3.9, -8.8, -8),
  box('gallery-c-spine-north', 5.9, 6.1, -16, -14), box('gallery-c-spine-middle', 5.9, 6.1, -12.2, -11), box('gallery-c-spine-south', 5.9, 6.1, -9, -8),
  box('gallery-d-return-partition', 3.9, 4.1, -20, -18),
  box('gallery-double-column-one', -0.78, -0.66, 3.2, 3.46, 'wall', 0, 2.55), box('gallery-double-column-two', -0.55, -0.43, 3.2, 3.46, 'wall', 0, 2.15),
  box('gallery-notched-frame-left', 0.66, 0.78, 3.2, 3.46, 'device', 0, 2.55),
  box('gallery-notched-frame-top', -0.78, 0.26, 3.2, 3.46, 'device', 2.4, 2.55),
];
const fixtureSolids = [
  box('emblem-panel-body', 1.17, 2.73, -7.9, -7.79, 'device', 1.24, 2.8),
  ...GALLERY_EMBLEM_SWITCHES.map(item => box(item.id + '-body', item.center.x - 0.21, item.center.x + 0.21, -7.9, -7.745, 'device', 0.83, 1.25)),
  box('emblem-latch-body', GALLERY_EMBLEM_LATCH.center.x - 0.2, GALLERY_EMBLEM_LATCH.center.x + 0.2, -7.9, -7.73, 'device', 1.24, 1.32),
  ...([['shadow-panel', GALLERY_SHADOW_FIXTURE], ['contour-panel', GALLERY_CONTOUR_FIXTURE]] as const).map(([id, fixture]) => box(id + '-body', fixture.center.x - fixture.width / 2 - 0.08, fixture.center.x + fixture.width / 2 + 0.08, -15.92, -15.79, 'device', fixture.center.y - fixture.height / 2 - 0.08, fixture.center.y + fixture.height / 2 + 0.08)),
];
let staticWalls: Record<'entrance' | 'exit', CollisionVolume[]> | undefined;
let key: { keyFrame: KeyFrame; keyFragments: KeyFragment[] } | undefined;
function galleryKey() {
  if (!key) {
    const translate = (point: { x: number; y: number; z: number }) => ({ x: point.x - 8, y: point.y, z: point.z - 6 });
    key = { keyFrame: { ...KEY_FRAME, center: translate(KEY_FRAME.center), outline: KEY_FRAME.outline.map(line => line.map(translate)) },
      keyFragments: KEY_FRAGMENTS.map(fragment => ({ ...fragment, strokeWidth: fragment.strokeWidth * 1.4, points: fragment.points.map(translate) })) };
  }
  return key;
}
/** Geometry, ray blockers, animated doors and renderer all consume this world. */
export function getGalleryWorld(runtime: Pick<ChapterRuntime, 'progress' | 'doorAOpen' | 'doorBOpen' | 'doorExitOpen' | 'alignment' | 'gallery'>): WorldGeometry {
  staticWalls ??= { entrance: [...boundaryWalls(layouts.entrance), ...fixed], exit: [...boundaryWalls(layouts.exit), ...fixed] };
  const { progress } = runtime, live = runtime.gallery;
  const door = (id: string, x1: number, x2: number, z1: number, z2: number, amount: number) => box(id, x1, x2, z1, z2, 'door', amount * 3.3, 3.2 + amount * 3.3);
  const solids = [...staticWalls[progress.variant], ...fixtureSolids,
    door('seal-a-door', -1, 1, -8.12, -7.92, runtime.doorAOpen),
    door('gallery-key-door', 1, 3, -14.12, -13.92, live?.doorDOpen ?? 0),
    door('gallery-shadow-shortcut', -4.1, -3.9, -13.4, -11.8, live?.doorShadowOpen ?? 0),
    door('gallery-contour-shortcut', 5.9, 6.1, -14, -12.2, live?.doorContourOpen ?? 0),
    door('seal-b-door', 3.9, 4.1, -22, -20, runtime.doorBOpen),
    door('gallery-return-door', 2.9, 3.1, -5, -3, runtime.doorBOpen),
    ...(progress.variant === 'exit' ? [door('exit-door', -1, 1, 13.92, 14.12, runtime.doorExitOpen)] : []),
  ];
  const panelTarget = (id: 'emblem-panel' | 'shadow-panel' | 'contour-panel', label: string, fixture: typeof GALLERY_SHADOW_FIXTURE) => ({ id, label, center: fixture.center, radius: 0.01, maxDistance: fixture.maxDistance,
    rectangle: { width: fixture.width, height: fixture.height, normal: fixture.normal, right: fixture.right } });
  const keyGeometry = galleryKey();
  return { chapterId: GALLERY_CHAPTER_ID, variant: progress.variant, floors: layouts[progress.variant], solids, colorPanels: [], ...keyGeometry, keyObservationPose: GALLERY_OBSERVATION_POSE,
    interactables: [panelTarget('emblem-panel', '触れない紋章', GALLERY_EMBLEM_FIXTURE),
      ...GALLERY_EMBLEM_SWITCHES.map(item => ({ id: item.id, label: item.glyph === 'circle' ? '丸の印' : item.glyph === 'diamond' ? 'ひし形の印' : '四角の印', center: item.center, radius: item.width / 2, maxDistance: item.maxDistance })),
      panelTarget('shadow-panel', '影の見本', GALLERY_SHADOW_FIXTURE), panelTarget('contour-panel', '描かれていない形', GALLERY_CONTOUR_FIXTURE),
      { id: 'key', label: progress.sealB ? '重なった鍵' : runtime.alignment ? '重ねる' : '欠けた鍵', center: keyGeometry.keyFrame.center, radius: 0.48, maxDistance: 8 },
      ...(progress.variant === 'exit' ? [{ id: 'exit' as const, label: '最後の扉', center: { x: 0, y: 1.4, z: 13.8 }, radius: 0.55, maxDistance: 2.2 }] : [])] };
}
