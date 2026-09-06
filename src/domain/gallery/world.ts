import { createPanelFixture, panelFixtureSolid } from '../firstPerson/panelFixture';
import { boundaryWalls } from '../firstPerson/chapter';
import type { ChapterRuntime, CollisionVolume, InteractableDefinition, InteractableId, WorldGeometry } from '../firstPerson/types';
import { GALLERY_CHAPTER_ID, GALLERY_CHROMATIC_FIXTURE, GALLERY_CONTOUR_FIXTURE, GALLERY_EXIT_PANEL_FIXTURE, GALLERY_FINAL_DOOR_FIXTURE, GALLERY_FLOORS, GALLERY_LIGHT_FIXTURE, GALLERY_SHADOW_FIXTURE } from './definition';
import type { GalleryFixture } from './types';

const box = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, kind: CollisionVolume['kind'] = 'wall', minY = 0, maxY = 3.2): CollisionVolume => ({ id, min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, kind, opaque: true });
const fixed = [
  box('gallery-b-spine-north', -4.1, -3.9, -14, -13.4), box('gallery-b-spine-middle', -4.1, -3.9, -11.8, -10.5), box('gallery-b-spine-south', -4.1, -3.9, -8.8, -8),
  box('gallery-c-spine-north', 5.9, 6.1, -16, -14), box('gallery-c-spine-middle', 5.9, 6.1, -12.2, -11), box('gallery-c-spine-south', 5.9, 6.1, -9, -8),
  // Opaque shelves leave a walkable entry at either end of each recess.
  box('gallery-retreat-west-shelf', 2.7, 3.15, 11.65, 12.85, 'device', 0, 2.45),
  box('gallery-retreat-east-shelf', 4.85, 5.3, 14.15, 15.35, 'device', 0, 2.45),
];
const fixtures = [
  ['gallery-light', GALLERY_LIGHT_FIXTURE], ['gallery-exit-panel', GALLERY_EXIT_PANEL_FIXTURE], ['chromatic-exhibit', GALLERY_CHROMATIC_FIXTURE],
  ['shadow-panel', GALLERY_SHADOW_FIXTURE], ['contour-panel', GALLERY_CONTOUR_FIXTURE],
] as const;
let staticSolids: CollisionVolume[] | undefined;
const panelTarget = (id: InteractableId, label: string, fixture: GalleryFixture): InteractableDefinition => ({ id, label, center: fixture.center, radius: .01, maxDistance: fixture.maxDistance,
  rectangle: { width: fixture.width, height: fixture.height, normal: fixture.normal, right: fixture.right } });
/** Version two has one immutable floor layout. Legacy seal/variant flags are
 * retained only as historical data and never select geometry or unlock gates. */
export function getGalleryWorld(runtime: Pick<ChapterRuntime, 'progress' | 'doorAOpen' | 'doorBOpen' | 'doorExitOpen' | 'alignment' | 'gallery'>): WorldGeometry {
  staticSolids ??= [...boundaryWalls(GALLERY_FLOORS, false), ...fixed, ...fixtures.map(([id, fixture]) => panelFixtureSolid(id + '-body', createPanelFixture(fixture)))];
  const gp = runtime.progress.gallery!, live = runtime.gallery;
  const service = live?.serviceDoorOpen ?? (gp.powerConnected ? 1 : 0);
  // Each visible bar is also an opaque collision/visibility volume; there is
  // no invisible full door plane hiding the exhibit standing beyond it.
  const bars = [-.94, -.63, -.32, 0, .32, .63, .94].map((x, i) => box('gallery-service-door-' + i, x - .055, x + .055, 5.94, 6.06, 'door', service * 3.3, 3.2 + service * 3.3));
  const exit = box('exit-door', 3, 5, 17.94, 18.06, 'door', runtime.doorExitOpen * 3.3, 3.2 + runtime.doorExitOpen * 3.3);
  const targets: InteractableDefinition[] = [
    panelTarget('gallery-light', '非常灯のスイッチ', GALLERY_LIGHT_FIXTURE),
    panelTarget('gallery-exit-panel', '出口の電源盤', GALLERY_EXIT_PANEL_FIXTURE),
    panelTarget('chromatic-exhibit', '展示番号13', GALLERY_CHROMATIC_FIXTURE),
    panelTarget('shadow-panel', '影の見本', GALLERY_SHADOW_FIXTURE), panelTarget('contour-panel', '描かれていない形', GALLERY_CONTOUR_FIXTURE),
    panelTarget('exit', '非常扉', GALLERY_FINAL_DOOR_FIXTURE),
  ];
  for (const [puzzle, fixture] of [['shadow', GALLERY_SHADOW_FIXTURE], ['contour', GALLERY_CONTOUR_FIXTURE]] as const) {
    if (gp[puzzle].solved && !gp.powerTaken[puzzle]) targets.push({ id: (puzzle + '-power') as InteractableId, label: '予備電源', center: { x: fixture.center.x, y: .72, z: fixture.center.z + .27 }, radius: .22, maxDistance: 5.3 });
  }
  return { chapterId: GALLERY_CHAPTER_ID, variant: 'entrance', floors: GALLERY_FLOORS, solids: [...staticSolids, ...bars, exit],
    colorPanels: [], keyFragments: [], keyFrame: { center: { x: 0, y: 0, z: 0 }, width: 0, height: 0, outline: [] }, interactables: targets };
}
