import type { ChapterRuntime, CheckpointState, WorldGeometry } from '../../domain/firstPerson/types';
type Stage = 'common' | 'gallery' | 'vault' | 'theatre';
type Entry = { create: (checkpoint?: CheckpointState, session?: number) => ChapterRuntime; world: (runtime: ChapterRuntime) => WorldGeometry; id: string };
const stages: Stage[] = ['common', 'gallery', 'vault', 'theatre'];
function permutations<T>(items: T[]): T[][] {
  return items.length ? items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [item, ...rest])) : [[]];
}
function load(stage: Stage): Entry {
  if (stage === 'common') {
    const api = require('../../domain/firstPerson') as typeof import('../../domain/firstPerson');
    return { create: api.createInitialRuntime, world: api.getWorld, id: api.CHAPTER_ID };
  }
  if (stage === 'gallery') {
    const api = require('../../domain/gallery') as typeof import('../../domain/gallery');
    return { create: api.createGalleryRuntime, world: api.getGalleryWorld, id: api.GALLERY_CHAPTER_ID };
  }
  if (stage === 'theatre') {
    const api = require('../../domain/theatre') as typeof import('../../domain/theatre');
    return { create: api.createTheatreRuntime, world: api.getTheatreWorld, id: api.THEATRE_CHAPTER_ID };
  }
  const runtime = require('../../domain/vault/runtime') as typeof import('../../domain/vault/runtime');
  const world = require('../../domain/vault/world') as typeof import('../../domain/vault/world');
  const definition = require('../../domain/vault/definition') as typeof import('../../domain/vault/definition');
  return { create: runtime.createVaultRuntime, world: world.getVaultWorld, id: definition.VAULT_CHAPTER_ID };
}
function assertGeometry(runtime: ChapterRuntime, world: WorldGeometry, id: string) {
  expect(runtime.chapterId).toBe(id);
  expect([runtime.pose.position.x, runtime.pose.position.y, runtime.pose.position.z, runtime.pose.yaw, runtime.pose.pitch].every(Number.isFinite)).toBe(true);
  expect(Number.isSafeInteger(runtime.session)).toBe(true);
  expect(runtime.emblem.sessionId).toBe(String(runtime.session));
  const stage = runtime.gallery ?? runtime.vault ?? runtime.theatre;
  if (stage) expect(stage.sessionId).toBe(String(runtime.session));
  expect(world.solids.length).toBeGreaterThan(0);
  for (const shape of world.solids) {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(Number.isFinite(shape.min[axis])).toBe(true); expect(Number.isFinite(shape.max[axis])).toBe(true);
      expect(shape.max[axis]).toBeGreaterThanOrEqual(shape.min[axis]);
    }
  }
}
function mutableObjects(value: unknown, result = new Set<object>()): Set<object> {
  if (!value || typeof value !== 'object') return result;
  if (!Object.isFrozen(value)) result.add(value);
  Object.values(value).forEach(child => mutableObjects(child, result));
  return result;
}
function assertIndependent(a: unknown, b: unknown) {
  const other = mutableObjects(b);
  expect([...mutableObjects(a)].filter(value => other.has(value))).toEqual([]);
}
function exercise(order: Stage[], controllerFirst = false) {
  jest.isolateModules(() => {
    if (controllerFirst) require('../../rendering/firstPerson/runtimeController');
    const entries = new Map<Stage, Entry>(), fresh = new Map<Stage, ChapterRuntime>(), allocated: number[] = [];
    for (const stage of order) {
      const entry = load(stage); entries.set(stage, entry);
      expect(typeof entry.create).toBe('function'); expect(typeof entry.world).toBe('function'); expect(typeof entry.id).toBe('string');
      // Construct directly before importing the next entrypoint. This exposes
      // top-level initialization-order failures instead of warming the dispatcher.
      const runtime = entry.create(); fresh.set(stage, runtime); allocated.push(runtime.session);
      assertGeometry(runtime, entry.world(runtime), entry.id);
    }
    const common = require('../../domain/firstPerson') as typeof import('../../domain/firstPerson');
    const constants = require('../../domain/firstPerson/constants') as typeof import('../../domain/firstPerson/constants');
    const envelope = require('../../domain/actorMotion/envelope') as typeof import('../../domain/actorMotion/envelope');
    const controller = require('../../rendering/firstPerson/runtimeController') as typeof import('../../rendering/firstPerson/runtimeController');
    const THREE = require('three') as typeof import('three');
    expect(common.EYE_HEIGHT).toBe(constants.EYE_HEIGHT);
    expect([constants.EYE_HEIGHT, constants.PLAYER_HEIGHT, constants.PLAYER_RADIUS, envelope.ACTOR_COLLISION_RADIUS].every(Number.isFinite)).toBe(true);
    for (const [index, a] of [...fresh.values()].entries()) for (const b of [...fresh.values()].slice(index + 1)) assertIndependent(a.progress, b.progress);
    for (const stage of order) {
      const entry = entries.get(stage)!, initial = fresh.get(stage)!;
      const dispatched = common.createInitialRuntime(undefined, undefined, entry.id); allocated.push(dispatched.session);
      expect(common.createCheckpoint(dispatched)).toEqual(common.createCheckpoint(initial));
      const checkpoint = common.createCheckpoint(initial), original = JSON.stringify(checkpoint);
      const first = entry.create(checkpoint), second = common.createInitialRuntime(checkpoint);
      allocated.push(first.session, second.session);
      assertGeometry(first, entry.world(first), entry.id); assertGeometry(second, common.getWorld(second), entry.id);
      assertIndependent(first.progress, second.progress); assertIndependent(first.progress, checkpoint.progress); assertIndependent(second.progress, checkpoint.progress);
      const secondBefore = JSON.stringify(second.progress);
      first.progress.hintStage = 1;
      expect(JSON.stringify(second.progress)).toBe(secondBefore);
      expect(JSON.stringify(checkpoint)).toBe(original);
      const owner = controller.createController(checkpoint, false, true, entry.id); allocated.push(owner.runtime.session);
      const camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
      const matrices = controller.syncCamera(owner, camera);
      expect([...matrices.view, ...matrices.projection].every(Number.isFinite)).toBe(true);
      assertGeometry(owner.runtime, controller.worldForController(owner), entry.id);
      expect(controller.controllerSnapshot(owner).runtime).toBe(owner.runtime);
      expect(controller.controllerCanInteract(owner)).toBe(false); // Construction alone never claims native readiness.
      assertIndependent(owner.runtime.progress, checkpoint.progress);
      controller.retireController(owner);
    }
    for (let i = 1; i < allocated.length; i++) expect(allocated[i]).toBe(allocated[i - 1]! + 1);
    const explicit = common.createInitialRuntime(undefined, 10000);
    expect(explicit.session).toBe(10000);
    for (const [index, stage] of order.entries()) expect(entries.get(stage)!.create().session).toBe(10001 + index);
  });
}

it.each(permutations(stages))('cold direct/dispatcher entry order %s → %s → %s → %s owns valid isolated state', (...order: Stage[]) => {
  exercise(order);
});
it('constructs after a controller-first cold import and again after a separate module registry', () => {
  exercise(['theatre', 'vault', 'gallery', 'common'], true);
  exercise(['gallery', 'theatre', 'common', 'vault'], true);
});
