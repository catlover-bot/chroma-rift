import { createVaultRuntime } from '../runtime';
import { applyVaultCommand, cancelVaultManipulation, vaultTargetAngle } from '../state';
import { finSegments, lengthMatches, LENGTH_SPEC, normalizeRodAngle, rodEndpoints, rodMatches, rodTargetAngle, shaftEndpoints } from '../specs';
import { VAULT_CHAPTER_ID } from '../definition';
import type { VaultAction } from '../types';
import type { ChapterRuntime } from '../../firstPerson/types';

function run(runtime: ChapterRuntime, action: VaultAction, targetId: string | null = null) {
  const v = runtime.vault!;
  return applyVaultCommand(runtime, { sessionId: v.sessionId, seq: v.lastSeq + 1, nowMs: v.lastNowMs + 1, action },
    { rendererReady: true, foreground: true, targetId });
}
function entered() { return run(createVaultRuntime(), { type: 'enter', puzzle: 'length' }, 'vault-length').runtime; }
function solvedLength() {
  let r = entered();
  r = run(r, { type: 'adjust', delta: .16 }).runtime;
  r = run(r, { type: 'adjust', delta: .16 }).runtime;
  return run(r, { type: 'commit' }).runtime;
}
it('measures shaft endpoints on one plane, excluding the different V-shaped decorations', () => {
  const reference = shaftEndpoints(LENGTH_SPEC.targetLength, true), slider = shaftEndpoints(LENGTH_SPEC.targetLength);
  expect(reference[1].x - reference[0].x).toBeCloseTo(slider[1].x - slider[0].x, 12);
  expect(reference.map(p => p.z)).toEqual(slider.map(p => p.z));
  const fins = finSegments(LENGTH_SPEC.targetLength), xs = fins.flatMap(f => [f.from.x, f.to.x]);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(LENGTH_SPEC.targetLength);
  expect(lengthMatches(LENGTH_SPEC.targetLength)).toBe(true);
  expect(lengthMatches(Math.max(...xs) - Math.min(...xs))).toBe(false);
});
it('drag/release stores the last displayed length; only explicit commit releases once', () => {
  let r = entered(), x = LENGTH_SPEC.left + r.vault!.length, y = LENGTH_SPEC.sliderY;
  r = run(r, { type: 'drag-start', pointerId: 4, point: { x, y } }).runtime;
  r = run(r, { type: 'drag-move', pointerId: 4, point: { x: x + .32, y } }).runtime;
  expect(r.vault!.length).toBeCloseTo(LENGTH_SPEC.targetLength);
  expect(r.progress.vault!.length.length).toBe(LENGTH_SPEC.initialLength);
  expect(run(r, { type: 'commit' }).accepted).toBe(false);
  r = run(r, { type: 'drag-end', pointerId: 4, inside: true }).runtime;
  expect(r.progress.vault!.length.length).toBe(r.vault!.length);
  expect(r.progress.vault!.length.solved).toBe(false);
  r = run(r, { type: 'commit' }).runtime;
  expect(r.progress.vault!.length).toMatchObject({ solved: true, attempts: 1 });
  expect(run(r, { type: 'commit' }).accepted).toBe(false);
  expect(r.progress.vault!.rod.solved).toBe(false);
});
it.each(['cancel', 'outside', 'wrong-pointer'] as const)('preserves the committed length for %s', mode => {
  let r = entered(), before = r.progress.vault!.length;
  r = run(r, { type: 'drag-start', pointerId: 4, point: { x: LENGTH_SPEC.left + r.vault!.length, y: LENGTH_SPEC.sliderY } }).runtime;
  r = run(r, { type: 'drag-move', pointerId: 4, point: { x: .8, y: LENGTH_SPEC.sliderY } }).runtime;
  if (mode === 'cancel') r = cancelVaultManipulation(r, true);
  else if (mode === 'outside') r = run(r, { type: 'drag-end', pointerId: 4, inside: false }).runtime;
  else expect(run(r, { type: 'drag-end', pointerId: 99, inside: true }).accepted).toBe(false);
  expect(r.progress.vault!.length).toEqual(before);
  if (mode !== 'wrong-pointer') { expect(r.vault!.activeDrag).toBeNull(); expect(r.vault!.length).toBe(before.length); }
});
it('folding context or showing guides preserves lengths, actor, pose and all gates', () => {
  let r = entered(); const before = r;
  for (const aid of ['finsHidden', 'lengthGuide'] as const) r = run(r, { type: 'aid', aid, enabled: true }).runtime;
  expect(r.pose).toBe(before.pose); expect(r.vault!.actor).toBe(before.vault!.actor);
  expect(r.progress.vault!.length).toBe(before.progress.vault!.length);
  expect(r.progress.vault!.rod).toBe(before.progress.vault!.rod);
  expect(r.vault!.lengthGateOpen).toBe(0); expect(r.progress.cleared).toBe(false);
  const wrong = run(r, { type: 'commit' });
  expect(wrong.runtime.progress.vault!.length).toMatchObject({ solved: false, length: LENGTH_SPEC.initialLength, attempts: 1 });
  expect(wrong.runtime.vault!.actor).toBe(before.vault!.actor);
});
it('derives a board-local vertical from world gravity and accepts equivalent ends pi apart', () => {
  for (const roll of [-.45, 0, .3]) {
    const right = { x: Math.cos(roll), y: Math.sin(roll), z: 0 }, up = { x: -Math.sin(roll), y: Math.cos(roll), z: 0 };
    const angle = rodTargetAngle(right, up), end = rodEndpoints(angle)[1];
    expect(end.x * right.x + end.y * up.x).toBeCloseTo(0, 12);
    expect(rodMatches(angle, angle)).toBe(true);
    expect(rodMatches(angle + Math.PI, angle)).toBe(true);
    expect(rodMatches(angle + .15, angle)).toBe(false);
  }
  expect(rodTargetAngle({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeNaN();
});
it('rotates one bidirectional rod, keeps frame/plumb comparisons independent, and locks explicitly', () => {
  let r = run(solvedLength(), { type: 'leave' }).runtime;
  r = run(r, { type: 'enter', puzzle: 'rod' }, 'vault-rod').runtime;
  const before = r, angle = r.vault!.angle;
  for (const aid of ['frameHidden', 'plumb'] as const) r = run(r, { type: 'aid', aid, enabled: true }).runtime;
  expect(r.vault!.angle).toBe(angle); expect(r.pose).toBe(before.pose); expect(r.vault!.actor).toBe(before.vault!.actor);
  const start = rodEndpoints(angle)[0]; // Either equivalent end is a real handle.
  r = run(r, { type: 'drag-start', pointerId: 8, point: start }).runtime;
  expect(r.vault!.activeDrag?.pointerId).toBe(8);
  r = run(r, { type: 'drag-move', pointerId: 8, point: { x: 0, y: -.55 } }).runtime;
  expect(rodMatches(r.vault!.angle, vaultTargetAngle())).toBe(true);
  r = run(r, { type: 'drag-end', pointerId: 8, inside: true }).runtime;
  expect(r.progress.vault!.rod.solved).toBe(false);
  r = run(r, { type: 'commit' }).runtime;
  expect(r.progress.vault!.rod.solved).toBe(true); expect(r.progress.exitDoorOpen).toBe(true);
  expect(r.progress.cleared).toBe(false); expect(r.progress.vault!.finalDoorClosed).toBe(false);
  expect(normalizeRodAngle(r.progress.vault!.rod.angle)).toBeCloseTo(0, 10);
});
it('rejects unavailable second devices, stale commands and unready foreground without granting progress', () => {
  const r = createVaultRuntime(), v = r.vault!;
  expect(r.chapterId).toBe(VAULT_CHAPTER_ID);
  expect(run(r, { type: 'enter', puzzle: 'rod' }, 'vault-rod').accepted).toBe(false);
  const command = { sessionId: v.sessionId, seq: 1, nowMs: 1, action: { type: 'enter', puzzle: 'length' } as VaultAction };
  const blocked = applyVaultCommand(r, command, { rendererReady: false, foreground: true, targetId: 'vault-length' });
  expect(blocked.accepted).toBe(false);
  expect(applyVaultCommand(blocked.runtime, command, { rendererReady: true, foreground: true, targetId: 'vault-length' }).accepted).toBe(false);
  expect(applyVaultCommand(r, { ...command, sessionId: 'old' }, { rendererReady: true, foreground: true, targetId: 'vault-length' }).runtime).toBe(r);
  expect(blocked.runtime.progress).toBe(r.progress);
});
