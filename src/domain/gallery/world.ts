import { createPanelFixture, panelFixtureSolid } from '../firstPerson/panelFixture';
import { boundaryWalls } from '../firstPerson/chapter';
import type { ChapterRuntime, CollisionVolume, InteractableDefinition, InteractableId, WorldGeometry } from '../firstPerson/types';
import { GALLERY_CHAPTER_ID, GALLERY_CHROMATIC_FIXTURE, GALLERY_CONTOUR_FIXTURE, GALLERY_EXIT_PANEL_FIXTURE, GALLERY_FINAL_DOOR_FIXTURE, GALLERY_FLOORS, GALLERY_LIGHT_FIXTURE, GALLERY_SHADOW_FIXTURE, GALLERY_WIRING_FIXTURE, GALLERY_MASK_FIXTURE, GALLERY_MASK_WINDOW_FIXTURE, GALLERY_HYBRID_FIXTURE } from './definition';
import { ACTOR_COLLISION_RADIUS } from './actor';
import type { GalleryFixture } from './types';

const box = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, kind: CollisionVolume['kind'] = 'wall', minY = 0, maxY = 3.2): CollisionVolume => ({ id, min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, kind, opaque: true });
const fixed = [
  box('gallery-maintenance-front', -6, -1, 5.94, 6.06),
  box('gallery-mask-back', 2.83, 2.91, -5.56, -4.44, 'device', 1.1, 2.5),
  box('gallery-mask-far-side', 2.2, 2.91, -5.56, -5.52, 'device', 1.1, 2.5),
  box('gallery-mask-base', 2.2, 2.91, -5.56, -4.44, 'device', 1.1, 1.14),
  box('gallery-mask-top', 2.2, 2.91, -5.56, -4.44, 'device', 2.46, 2.5),
  box('gallery-b-spine-north', -4.1, -3.9, -14, -13.4), box('gallery-b-spine-middle', -4.1, -3.9, -11.8, -10.5), box('gallery-b-spine-south', -4.1, -3.9, -8.8, -8),
  box('gallery-c-spine-north', 5.9, 6.1, -16, -14), box('gallery-c-spine-middle', 5.9, 6.1, -12.2, -11), box('gallery-c-spine-south', 5.9, 6.1, -9, -8),
  // Opaque shelves leave a walkable entry at either end of each recess.
  box('gallery-retreat-west-shelf', 2.7, 3.15, 13.2, 14.4, 'device', 0, 2.45),
  box('gallery-retreat-east-shelf', 4.85, 5.3, 18.2, 19.4, 'device', 0, 2.45),
];
const fixtures = [
  ['gallery-light', GALLERY_LIGHT_FIXTURE], ['gallery-exit-panel', GALLERY_EXIT_PANEL_FIXTURE], ['chromatic-exhibit', GALLERY_CHROMATIC_FIXTURE],
  ['shadow-panel', GALLERY_SHADOW_FIXTURE], ['contour-panel', GALLERY_CONTOUR_FIXTURE], ['wiring-panel', GALLERY_WIRING_FIXTURE], ['hybrid-exhibit', GALLERY_HYBRID_FIXTURE],
] as const;
let staticSolids: CollisionVolume[] | undefined;
const panelTarget = (id: InteractableId, label: string, fixture: GalleryFixture): InteractableDefinition => ({ id, label, center: fixture.center, radius: .01, maxDistance: fixture.maxDistance,
  rectangle: { width: fixture.width, height: fixture.height, normal: fixture.normal, right: fixture.right } });
/** Version three has one immutable floor layout. Legacy seal/variant flags are
 * retained only as historical data and never select geometry or unlock gates. */
export function getGalleryWorld(runtime: Pick<ChapterRuntime, 'progress' | 'doorAOpen' | 'doorBOpen' | 'doorExitOpen' | 'alignment' | 'gallery'>): WorldGeometry {
  staticSolids ??= [...boundaryWalls(GALLERY_FLOORS, false), ...fixed, ...fixtures.map(([id, fixture]) => panelFixtureSolid(id + '-body', createPanelFixture(fixture)))];
  const gp = runtime.progress.gallery!, live = runtime.gallery;
  const service = live?.serviceDoorOpen ?? (gp.powerConnected ? 1 : 0);
  // Each visible bar is also an opaque collision/visibility volume; there is
  // no invisible full door plane hiding the exhibit standing beyond it.
  const bars = [-.94, -.7, .7, .94].map((x, i) => box('gallery-service-door-' + i, x - .055, x + .055, 5.94, 6.06, 'door', service * 3.3, 3.2 + service * 3.3));
  bars.push(box('gallery-service-door-lower-rail', -1, 1, 5.94, 6.06, 'door', .85 + service * 3.3, .95 + service * 3.3),
    box('gallery-service-door-upper-rail', -1, 1, 5.94, 6.06, 'door', 2.65 + service * 3.3, 2.75 + service * 3.3));
  const actor = live?.actor;
  const actorBody = actor?.visible ? [{ ...box('gallery-actor-body', actor.position.x - ACTOR_COLLISION_RADIUS, actor.position.x + ACTOR_COLLISION_RADIUS,
    actor.position.z - ACTOR_COLLISION_RADIUS, actor.position.z + ACTOR_COLLISION_RADIUS, 'device', -.04, 2.24), opaque: false }] : [];
  const wiring = live?.wiringDoorOpen ?? (gp.wiring.solved ? 1 : 0);
  const wiringShutter = box('gallery-wiring-shutter', 3, 5, 10.94, 11.06, 'door', wiring * 3.3, 3.2 + wiring * 3.3);
  const wiringBypass = box('gallery-wiring-bypass', .94, 1.06, 10, 13.06, 'door', wiring * 3.3, 3.2 + wiring * 3.3);
  const maskWindow = box('mask-window-body', 2.204, 2.826, -4.478, -4.448, 'device', 1.144 + (gp.maskWindowOpen ? 1.6 : 0), 2.456 + (gp.maskWindowOpen ? 1.6 : 0));
  const exit = box('exit-door', 3, 5, 22.94, 23.06, 'door', gp.finalDoorClosed ? 0 : 3.3, gp.finalDoorClosed ? 3.2 : 6.5);
  const targets: InteractableDefinition[] = [
    panelTarget('gallery-light', '非常灯のスイッチ', GALLERY_LIGHT_FIXTURE),
    panelTarget('gallery-exit-panel', '出口の電源盤', GALLERY_EXIT_PANEL_FIXTURE),
    panelTarget('chromatic-exhibit', '展示番号13', GALLERY_CHROMATIC_FIXTURE),
    panelTarget('shadow-panel', '影の見本', GALLERY_SHADOW_FIXTURE), panelTarget('contour-panel', '描かれていない形', GALLERY_CONTOUR_FIXTURE),
    panelTarget('wiring-panel', '隠れた配線', GALLERY_WIRING_FIXTURE),
    panelTarget('mask-exhibit', '見返す仮面', GALLERY_MASK_FIXTURE), panelTarget('mask-window', '側面の検査窓', { ...GALLERY_MASK_WINDOW_FIXTURE, center: { ...GALLERY_MASK_WINDOW_FIXTURE.center, y: GALLERY_MASK_WINDOW_FIXTURE.center.y + (gp.maskWindowOpen ? 1.6 : 0) } }),
    panelTarget('hybrid-exhibit', '閉館の掲示', GALLERY_HYBRID_FIXTURE),
    panelTarget('exit', '非常扉', GALLERY_FINAL_DOOR_FIXTURE),
  ];
  for (const [puzzle, fixture] of [['shadow', GALLERY_SHADOW_FIXTURE], ['contour', GALLERY_CONTOUR_FIXTURE]] as const) {
    if (gp[puzzle].solved && !gp.powerTaken[puzzle]) targets.push({ id: (puzzle + '-power') as InteractableId, label: '予備電源', center: { x: fixture.center.x, y: .72, z: fixture.center.z + .27 }, radius: .22, maxDistance: 5.3 });
  }
  return { chapterId: GALLERY_CHAPTER_ID, variant: 'entrance', floors: GALLERY_FLOORS, solids: [...staticSolids, ...bars, ...actorBody, wiringShutter, wiringBypass, maskWindow, exit],
    colorPanels: [], keyFragments: [], keyFrame: { center: { x: 0, y: 0, z: 0 }, width: 0, height: 0, outline: [] }, interactables: targets };
}
