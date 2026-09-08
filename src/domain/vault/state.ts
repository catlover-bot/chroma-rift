import { clamp } from '../firstPerson/geometry';
import type { ChapterRuntime, PlayerPose } from '../firstPerson/types';
import { DEVICE_HANDLE_HIT_RADIUS, LENGTH_SPEC, ROD_SPEC, boundLength, lengthMatches, normalizeRodAngle, rodMatches, rodTargetAngle } from './specs';
import { VAULT_CHECKPOINTS, VAULT_ROD_FIXTURE, VAULT_SEED, VAULT_SPAWN } from './definition';
import type { VaultCommand, VaultProgress, VaultTransient } from './types';
import { initialVaultActor } from './actor';
export function initialVaultProgress(seed = VAULT_SEED): VaultProgress {
  return { schemaVersion: 1, specVersion: 1, seed: Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : VAULT_SEED,
    length: { length: LENGTH_SPEC.initialLength, solved: false, attempts: 0 }, rod: { angle: ROD_SPEC.initialAngle, solved: false, attempts: 0 },
    discoveries: { length: false, rod: false, cafe: false }, aids: { finsHidden: false, lengthGuide: false, frameHidden: false, plumb: false, cafeNeutral: false },
    story: { revealStarted: false, revealPresented: false, finalPursuitStarted: false }, finalDoorClosed: false };
}
export function initialVaultTransient(saved: VaultProgress, sessionId: string, pose = VAULT_SPAWN): VaultTransient {
  const checkpointId = saved.rod.solved && samePlace(pose, VAULT_CHECKPOINTS.exit) ? 'exit' :
    saved.length.solved && samePlace(pose, VAULT_CHECKPOINTS.brake) ? 'brake' : 'entry';
  return { sessionId, lastSeq: 0, lastNowMs: 0, mode: 'explore', actor: initialVaultActor(saved),
    lastSafePose: VAULT_CHECKPOINTS[checkpointId], checkpointId, length: saved.length.length, angle: saved.rod.angle, activeDrag: null,
    lengthGateOpen: Number(saved.length.solved), brakeGateOpen: Number(saved.rod.solved), partitionClosed: false,
    exitClosureSeconds: 0, revealSeconds: 0, noiseDistance: 0, noiseSequence: 0 };
}
function samePlace(a: PlayerPose, b: PlayerPose) { return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) < .001; }
export function vaultTargetAngle(): number {
  const n = VAULT_ROD_FIXTURE.normal, r = VAULT_ROD_FIXTURE.right;
  return rodTargetAngle(r, { x: n.y * r.z - n.z * r.y, y: n.z * r.x - n.x * r.z, z: n.x * r.y - n.y * r.x });
}
export function cancelVaultManipulation(runtime: ChapterRuntime, leave = false): ChapterRuntime {
  const live = runtime.vault, saved = runtime.progress.vault;
  if (!live || !saved) return runtime;
  if (!live.activeDrag && (!leave || live.mode === 'explore')) return runtime;
  return { ...runtime, vault: { ...live, activeDrag: null, length: saved.length.length, angle: saved.rod.angle, ...(leave ? { mode: 'explore' as const } : {}) } };
}
export function isVaultExitThreshold(pose: PlayerPose): boolean {
  return pose.position.x >= 1.85 && pose.position.x <= 4.15 && pose.position.z >= 28.05 && pose.position.z <= 30.5;
}
export function vaultSafeArea(runtime: ChapterRuntime): keyof typeof VAULT_CHECKPOINTS | undefined {
  const p = runtime.pose.position, saved = runtime.progress.vault!;
  if (saved.rod.solved && isVaultExitThreshold(runtime.pose)) return 'exit';
  if (saved.length.solved && p.x < -4.35 && p.x > -7.5 && p.z > 16.5 && p.z < 20.5) return 'brake';
  if (p.z < 3 && p.z > -1.5 && Math.abs(p.x) < 2.5) return 'entry';
  return undefined;
}
export function advanceVault(runtime: ChapterRuntime, dt: number): ChapterRuntime {
  const saved = runtime.progress.vault, live = runtime.vault;
  if (!saved || !live || runtime.paused || runtime.progress.cleared || !Number.isFinite(dt) || dt <= 0) return runtime;
  const elapsed = clamp(dt, 0, .05), safe = vaultSafeArea(runtime), remaining = Math.max(0, (live.feedback?.remainingSeconds ?? 0) - elapsed);
  return { ...runtime, vault: { ...live,
    lengthGateOpen: Math.min(1, live.lengthGateOpen + (saved.length.solved ? elapsed / .9 : 0)),
    brakeGateOpen: Math.min(1, live.brakeGateOpen + (saved.rod.solved ? elapsed / .9 : 0)),
    ...(safe ? { checkpointId: safe, lastSafePose: VAULT_CHECKPOINTS[safe] } : {}),
    feedback: live.feedback && remaining > 0 ? { ...live.feedback, remainingSeconds: remaining } : undefined } };
}
const finitePoint = (p: { x: number; y: number }) => Number.isFinite(p.x) && Number.isFinite(p.y);
export function applyVaultCommand(runtime: ChapterRuntime, command: VaultCommand, context: { rendererReady: boolean; foreground: boolean; targetId: string | null }) {
  const live = runtime.vault, saved = runtime.progress.vault;
  const reject = (next = runtime) => ({ runtime: next, accepted: false, stopInput: false, message: '' });
  if (!live || !saved || command.sessionId !== live.sessionId || !Number.isSafeInteger(command.seq) || command.seq <= live.lastSeq ||
    !Number.isFinite(command.nowMs) || command.nowMs < live.lastNowMs) return reject();
  const consumed = { ...runtime, vault: { ...live, lastSeq: command.seq, lastNowMs: command.nowMs } };
  if (!context.rendererReady || !context.foreground || runtime.paused || runtime.progress.cleared) return reject(consumed);
  let v = consumed.vault, p = saved, stopInput = false, message = '', cleared: boolean = runtime.progress.cleared;
  const a = command.action;
  if (a.type === 'enter') {
    if (live.mode !== 'explore' || context.targetId !== 'vault-' + a.puzzle || a.puzzle === 'rod' && !saved.length.solved) return reject(consumed);
    v = { ...v, mode: a.puzzle, activeDrag: null }; p = { ...p, discoveries: { ...p.discoveries, [a.puzzle]: true } }; stopInput = true;
  } else if (a.type === 'leave' || a.type === 'cancel') {
    return { runtime: cancelVaultManipulation(consumed, a.type === 'leave'), accepted: true, stopInput: a.type === 'leave', message };
  } else if (a.type === 'cafe-inspect') {
    if (live.mode !== 'explore' || context.targetId !== 'vault-cafe') return reject(consumed);
    p = { ...p, discoveries: { ...p.discoveries, cafe: true }, aids: { ...p.aids, cafeNeutral: !p.aids.cafeNeutral } };
  } else if (a.type === 'close-exit') {
    if (live.mode !== 'explore' || context.targetId !== 'vault-exit' || !saved.rod.solved || !isVaultExitThreshold(runtime.pose)) return reject(consumed);
    p = { ...p, finalDoorClosed: true }; v = { ...v, exitClosureSeconds: 1.4, actor: { ...v.actor, phase: 'resolved' } }; cleared = true; stopInput = true;
  } else if (a.type === 'close-partition') {
    if (context.targetId !== 'vault-partition' || !saved.rod.solved || live.mode !== 'explore' || runtime.pose.position.z < 24.1 ||
      Math.abs(v.actor.motion.position.z - 23.7) < .6) return reject(consumed);
    v = { ...v, partitionClosed: true }; stopInput = true;
  } else if (a.type === 'aid') {
    const allowed = live.mode === 'length' ? ['finsHidden', 'lengthGuide'] : live.mode === 'rod' ? ['frameHidden', 'plumb'] : [];
    if (!allowed.includes(a.aid)) return reject(consumed);
    p = { ...p, aids: { ...p.aids, [a.aid]: a.enabled } };
  } else {
    const puzzle = live.mode;
    if (puzzle === 'explore' || saved[puzzle].solved) return reject(consumed);
    if (a.type === 'adjust') {
      if (live.activeDrag || !Number.isFinite(a.delta) || Math.abs(a.delta) > .2) return reject(consumed);
      if (puzzle === 'length') { v = { ...v, length: boundLength(v.length + a.delta) }; p = { ...p, length: { ...p.length, length: v.length } }; }
      else { v = { ...v, angle: normalizeRodAngle(v.angle + a.delta) }; p = { ...p, rod: { ...p.rod, angle: v.angle } }; }
    } else if (a.type === 'drag-start') {
      if (live.activeDrag || !Number.isSafeInteger(a.pointerId) || !finitePoint(a.point)) return reject(consumed);
      const handle = puzzle === 'length' ? { x: LENGTH_SPEC.left + v.length, y: LENGTH_SPEC.sliderY } :
        { x: Math.sin(v.angle) * ROD_SPEC.length / 2, y: Math.cos(v.angle) * ROD_SPEC.length / 2 };
      if (Math.hypot(a.point.x - handle.x, a.point.y - handle.y) > DEVICE_HANDLE_HIT_RADIUS && (puzzle === 'length' || Math.hypot(a.point.x + handle.x, a.point.y + handle.y) > DEVICE_HANDLE_HIT_RADIUS)) return reject(consumed);
      v = { ...v, activeDrag: { puzzle, pointerId: a.pointerId, startValue: puzzle === 'length' ? v.length : v.angle, startPoint: { ...a.point }, lastPointerAngle: Math.atan2(a.point.x, a.point.y) } };
    } else if (a.type === 'drag-move') {
      const drag = live.activeDrag;
      if (!drag || drag.pointerId !== a.pointerId || !finitePoint(a.point)) return reject(consumed);
      if (puzzle === 'length') v = { ...v, length: boundLength(drag.startValue + a.point.x - drag.startPoint.x) };
      else {
        if (Math.hypot(a.point.x, a.point.y) < .05) return reject(consumed);
        const current = Math.atan2(a.point.x, a.point.y), change = Math.atan2(Math.sin(current - drag.lastPointerAngle), Math.cos(current - drag.lastPointerAngle));
        v = { ...v, angle: normalizeRodAngle(v.angle + change), activeDrag: { ...drag, lastPointerAngle: current } };
      }
    } else if (a.type === 'drag-end') {
      if (!live.activeDrag || live.activeDrag.pointerId !== a.pointerId) return reject(consumed);
      if (!a.inside) return { runtime: cancelVaultManipulation(consumed), accepted: true, stopInput, message };
      if (puzzle === 'length') p = { ...p, length: { ...p.length, length: v.length } };
      else p = { ...p, rod: { ...p.rod, angle: v.angle } };
      v = { ...v, activeDrag: null };
    } else if (a.type === 'commit') {
      if (live.activeDrag) return reject(consumed);
      const correct = puzzle === 'length' ? lengthMatches(v.length) : rodMatches(v.angle, vaultTargetAngle());
      if (puzzle === 'length' && v.length !== p.length.length || puzzle === 'rod' && v.angle !== p.rod.angle) return reject(consumed);
      if (puzzle === 'length') p = { ...p, length: { ...p.length, solved: correct, attempts: Math.min(999, p.length.attempts + 1) } };
      else p = { ...p, rod: { ...p.rod, solved: correct, attempts: Math.min(999, p.rod.attempts + 1) } };
      v = { ...v, feedback: { puzzle, correct, sequence: command.seq, remainingSeconds: .9 } };
      message = correct ? puzzle === 'length' ? '留め金が収まり、格子が開いた。' : '針をロックした。搬出口へ。' :
        puzzle === 'length' ? 'まだ収まらない。棒の長さを調整しよう。' : 'まだ鉛直と違う。下げ振りで確かめられます。';
    }
  }
  return { runtime: { ...consumed, vault: v, progress: { ...runtime.progress, vault: p, exitDoorOpen: p.rod.solved, cleared } },
    accepted: true, stopInput, message };
}
