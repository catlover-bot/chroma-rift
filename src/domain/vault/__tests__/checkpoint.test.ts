import { createCheckpoint, createInitialRuntime } from '../../firstPerson';
import { createGalleryRuntime } from '../../gallery';
import { vaultCheckpoint, vaultRuntime } from '../../../storage/testFixtures/vault';
import { createVaultCheckpoint, parseVaultProgress, restoreVaultCheckpoint } from '../checkpoint';
import { VAULT_CHECKPOINTS } from '../definition';
import { LENGTH_SPEC } from '../specs';
import type { VaultProgress } from '../types';

it.each(['entry', 'length', 'rod', 'clear'] as const)('round trips strict %s progress at its authored safe checkpoint', stage => {
  const cp = vaultCheckpoint(stage, 0xffffffff), result = restoreVaultCheckpoint(JSON.parse(JSON.stringify(cp)));
  expect(result).toEqual({ checkpoint: cp, recovered: false, emblemStatus: 'valid' });
  expect(result!.checkpoint.progress.vault).not.toBe(cp.progress.vault);
  expect(result!.checkpoint.pose).not.toBe(cp.pose);
});

it('rejects foreign chapters and every unsupported schema, level, and spec version', () => {
  const cp = vaultCheckpoint();
  for (const bad of [createCheckpoint(createInitialRuntime()), createCheckpoint(createGalleryRuntime()),
    { ...cp, schemaVersion: 2 }, { ...cp, chapterId: 'uncanny-vault-v2' }, { ...cp, levelVersion: 2 },
    { ...cp, progress: { ...cp.progress, vault: { ...cp.progress.vault, schemaVersion: 2 } } },
    { ...cp, progress: { ...cp.progress, vault: { ...cp.progress.vault, specVersion: 2 } } }]) expect(restoreVaultCheckpoint(bad)).toBeUndefined();
});

it('rejects impossible success, skipped gates, wrong values, nonfinite values, and false closure records', () => {
  const cp = vaultCheckpoint();
  const changes: ((p: VaultProgress) => void)[] = [
    p => { p.seed = -1; }, p => { p.seed = 0x100000000; }, p => { p.seed = 1.5; },
    p => { p.length.length = NaN; }, p => { p.length.length = Infinity; }, p => { p.length.length = LENGTH_SPEC.maxLength + .01; },
    p => { p.length.attempts = 1000; }, p => { p.length.solved = true; p.length.attempts = 1; },
    p => { p.length.length = LENGTH_SPEC.targetLength; p.length.solved = true; },
    p => { p.rod.angle = Math.PI; }, p => { p.rod.angle = Infinity; }, p => { p.rod.solved = true; p.rod.angle = 0; p.rod.attempts = 1; },
    p => { p.story.revealPresented = true; }, p => { p.story.revealStarted = true; },
    p => { p.story.finalPursuitStarted = true; }, p => { p.finalDoorClosed = true; },
  ];
  for (const change of changes) {
    const candidate = JSON.parse(JSON.stringify(cp)); change(candidate.progress.vault);
    expect(restoreVaultCheckpoint(candidate)).toBeUndefined();
  }
  const unlocked = vaultCheckpoint('rod');
  expect(restoreVaultCheckpoint({ ...unlocked, progress: { ...unlocked.progress, cleared: true } })).toBeUndefined();
  expect(restoreVaultCheckpoint({ ...unlocked, progress: { ...unlocked.progress, exitDoorOpen: false } })).toBeUndefined();
  expect(restoreVaultCheckpoint({ ...unlocked, progress: { ...unlocked.progress, sealA: true } })).toBeUndefined();
  expect(restoreVaultCheckpoint({ ...unlocked, progress: { ...unlocked.progress, gallery: createGalleryRuntime().progress.gallery } })).toBeUndefined();
});

it('keeps aids and an inspected unsolved puzzle independent from solving or perception claims', () => {
  const cp = vaultCheckpoint(), p = cp.progress.vault!;
  Object.keys(p.aids).forEach(key => { p.aids[key as keyof VaultProgress['aids']] = true; });
  p.discoveries.length = true;
  const loaded = restoreVaultCheckpoint(cp)!;
  expect(loaded.checkpoint.progress.vault!.aids).toEqual(p.aids);
  expect(loaded.checkpoint.progress.vault!.length.solved).toBe(false);
  expect(loaded.checkpoint.progress.cleared).toBe(false);
  const raw = { ...p, actor: { phase: 'pursue' }, activeDrag: { pointerId: 4 }, renderer: 'native-owner' };
  expect(parseVaultProgress(raw)).toEqual(p);
});

it('recovers invalid and locked positions without granting an unvisited downstream refuge', () => {
  const cp = vaultCheckpoint('length');
  for (const pose of [VAULT_CHECKPOINTS.exit, { ...VAULT_CHECKPOINTS.brake, yaw: 0 },
    { ...VAULT_CHECKPOINTS.entry, position: { x: 0, y: 100, z: 0 } }, { position: { x: NaN }, yaw: 0, pitch: 0 }, null]) {
    const result = restoreVaultCheckpoint({ ...cp, pose })!;
    expect(result.recovered).toBe(true); expect(result.checkpoint.pose).toEqual(VAULT_CHECKPOINTS.entry);
    expect(result.checkpoint.progress).toEqual(cp.progress);
  }
  const cleared = vaultCheckpoint('clear');
  const result = restoreVaultCheckpoint({ ...cleared, pose: VAULT_CHECKPOINTS.entry })!;
  expect(result).toMatchObject({ recovered: true, checkpoint: { pose: VAULT_CHECKPOINTS.exit, progress: { cleared: true } } });
});

it('saves only confirmed values and the last authorized refuge while excluding live drag, AI and presentation state', () => {
  const runtime = vaultRuntime('length'), expected = createVaultCheckpoint(runtime);
  runtime.pose = { position: { x: 3.8, y: 1.6, z: 15 }, yaw: .7, pitch: .2 };
  runtime.vault!.mode = 'rod'; runtime.vault!.length = 1.5; runtime.vault!.angle = 1.2;
  runtime.vault!.activeDrag = { puzzle: 'rod', pointerId: 99, startValue: 0, startPoint: { x: 0, y: 1 }, lastPointerAngle: .4 };
  runtime.vault!.actor.phase = 'pursue'; runtime.vault!.actor.lastSeen = { x: 2, y: 1.6, z: 18 };
  runtime.vault!.exitClosureSeconds = .4;
  const snapshot = createVaultCheckpoint(runtime);
  expect(snapshot).toEqual(expected);
  runtime.progress.vault!.aids.plumb = true;
  expect(snapshot.progress.vault!.aids.plumb).toBe(false);
  expect(JSON.stringify(snapshot)).not.toMatch(/activeDrag|lastSeen|lastHeard|exitClosureSeconds|pointerId|phaseTime|renderer/);
  const initial = vaultRuntime(); initial.vault!.lastSafePose = VAULT_CHECKPOINTS.exit;
  expect(createVaultCheckpoint(initial).pose).toEqual(VAULT_CHECKPOINTS.entry);
});
