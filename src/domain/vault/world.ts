import { createPanelFixture, panelFixtureSolid } from '../firstPerson/panelFixture';
import type { ChapterRuntime, CollisionVolume, InteractableDefinition, InteractableId, WorldGeometry } from '../firstPerson/types';
import type { GalleryFixture } from '../gallery/types';
import { ACTOR_COLLISION_RADIUS } from '../gallery/actor';
import { VAULT_CAFE_FIXTURE, VAULT_CHAPTER_ID, VAULT_EXIT_FIXTURE, VAULT_FLOORS, VAULT_LENGTH_FIXTURE, VAULT_PARTITION_FIXTURE, VAULT_ROD_FIXTURE, VAULT_SOLIDS } from './definition';
const target = (id: InteractableId, label: string, f: GalleryFixture): InteractableDefinition => ({ id, label, center: f.center, radius: .01,
  maxDistance: f.maxDistance, rectangle: { width: f.width, height: f.height, normal: f.normal, right: f.right } });
const fixtures = [['vault-length', VAULT_LENGTH_FIXTURE], ['vault-rod', VAULT_ROD_FIXTURE]] as const;
const fixed = [...VAULT_SOLIDS, ...fixtures.map(([id, f]) => panelFixtureSolid(id + '-body', createPanelFixture(f)))];
const gate = (id: string, x: number, z: number, width: number, openness: number): CollisionVolume => ({ id, kind: 'door', opaque: true,
  min: { x: x - width / 2, y: openness * 3.3, z: z - .09 }, max: { x: x + width / 2, y: 3.1 + openness * 3.3, z: z + .09 } });
/** Real narrow openings: sight rays can pass; the player's 0.48 m footprint
 * cannot fit between the 0.35 m clear gaps. These are also the rendered bars. */
function lengthGrille(openness: number): CollisionVolume[] {
  const horizontal = (id: string, y: number): CollisionVolume => {
    const volume = gate(id, 0, 5, 2, openness);
    return { ...volume, min: { ...volume.min, y: y + openness * 3.3 }, max: { ...volume.max, y: y + .10 + openness * 3.3 } };
  };
  return [horizontal('vault-length-gate', .80), horizontal('vault-length-grille-top', 2.70),
    ...[-.8, -.4, 0, .4, .8].map((x, i) => gate('vault-length-grille-bar-' + i, x, 5, .05, openness))];
}
const targets = [target('vault-length', '伸びて見える留め金', VAULT_LENGTH_FIXTURE), target('vault-rod', '傾いた額縁の針', VAULT_ROD_FIXTURE),
  target('vault-cafe', '収蔵庫の目地', VAULT_CAFE_FIXTURE), target('vault-partition', '通路の仕切り', VAULT_PARTITION_FIXTURE), target('vault-exit', '搬出口の取っ手', VAULT_EXIT_FIXTURE)];
const emptyPanels: WorldGeometry['colorPanels'] = [], emptyFragments: WorldGeometry['keyFragments'] = [];
const unusedFrame = { center: { x: 0, y: 0, z: 0 }, width: 0, height: 0, outline: [] };
/** The accepted closure is saved immediately. The same 0.25 s gate travel owns
 * drawing and collision; the remainder is a stationary ending, with no input. */
export function vaultExitOpenness(runtime: Pick<ChapterRuntime, 'vault' | 'progress'>): number {
  if (!runtime.progress.vault?.finalDoorClosed) return 1;
  return Math.max(0, Math.min(1, ((runtime.vault?.exitClosureSeconds ?? 0) - 1.15) / .25));
}
let cached: { values: readonly number[]; world: WorldGeometry } | undefined;
export function getVaultWorld(runtime: Pick<ChapterRuntime, 'vault' | 'progress'>): WorldGeometry {
  const saved = runtime.progress.vault!, live = runtime.vault, actor = live?.actor;
  const a = live?.lengthGateOpen ?? Number(saved.length.solved), b = live?.brakeGateOpen ?? Number(saved.rod.solved);
  const c = live?.partitionClosed ? 0 : 1, d = vaultExitOpenness(runtime), visible = Number(!!actor?.visible);
  const x = actor?.motion.position.x ?? 0, z = actor?.motion.position.z ?? 0;
  const values = [a, b, c, d, visible, x, z];
  if (cached && values.every((value, i) => value === cached!.values[i])) return cached.world;
  const solids = [...fixed, ...lengthGrille(a), gate('vault-brake-gate', 3, 20, 3, b),
    gate('vault-egress-partition', 3, 23.7, 3, c), gate('vault-final-door', 3, 27.6, 3, d)];
  if (visible) {
    const r = ACTOR_COLLISION_RADIUS;
    solids.push({ id: 'vault-actor-body', kind: 'device', opaque: false,
      min: { x: x - r, y: 0, z: z - r }, max: { x: x + r, y: 2.24, z: z + r } });
  }
  const world: WorldGeometry = { chapterId: VAULT_CHAPTER_ID, variant: 'entrance', floors: VAULT_FLOORS, solids,
    interactables: targets, colorPanels: emptyPanels, keyFragments: emptyFragments, keyFrame: unusedFrame };
  cached = { values, world }; return world;
}
