import { PerspectiveCamera } from 'three';
import { createSealStimulus, type Glyph } from '../../emblem/stimulus';
import { checkpointSeal, reduceSeal, startSealSession, type SealAction } from '../../emblem/puzzle';
import { commitEmblemResult, createCheckpoint, createInitialRuntime, evaluateInteraction, evaluateRuntime, getWorld, hintForRuntime, interact, MOVE_SPEED, pauseRuntime, restoreCheckpoint, resumeRuntime, setHintStage, updatePlayer } from '..';
import { EMBLEM_FIXTURE, EMBLEM_SWITCHES, EMBLEM_SWITCH_FEEDBACK_SECONDS } from '../emblemFixture';
import type { ChapterRuntime, PlayerPose, Vec3 } from '..';

function matrices(pose: PlayerPose) {
  const camera = new PerspectiveCamera(65, 390 / 844, 0.08, 60);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
  return { view: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] };
}
function aim(runtime: ChapterRuntime, center: Vec3): ChapterRuntime {
  const dx = center.x - runtime.pose.position.x, dz = center.z - runtime.pose.position.z;
  return { ...runtime, pose: { ...runtime.pose, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(center.y - runtime.pose.position.y, Math.hypot(dx, dz)) } };
}
function walk(runtime: ChapterRuntime, x: number, z: number): ChapterRuntime {
  let next = runtime;
  for (let i = 0; i < 900; i += 1) {
    const dx = x - next.pose.position.x, dz = z - next.pose.position.z, distance = Math.hypot(dx, dz);
    if (distance < 0.025) return next;
    next = { ...next, pose: { ...next.pose, yaw: Math.atan2(-dx, -dz), pitch: 0 } };
    const dt = Math.min(1 / 60, distance / MOVE_SPEED);
    next = evaluateRuntime(next, updatePlayer(next.pose, { strafe: 0, forward: 1 }, dt, getWorld(next)), dt);
  }
  throw new Error('Authored first-room route blocked');
}
function atPanel(seed = 21): ChapterRuntime {
  const checkpoint = createCheckpoint(createInitialRuntime());
  checkpoint.progress.emblem = checkpointSeal(startSealSession(seed, 'fixture'));
  return aim(walk(walk(createInitialRuntime(checkpoint), 0, 1), 1.95, -5.8), EMBLEM_FIXTURE.center);
}
function press(runtime: ChapterRuntime, glyph: Glyph): ChapterRuntime {
  const aimed = aim(runtime, EMBLEM_SWITCHES.find((item) => item.glyph === glyph)!.center);
  return interact(aimed, `emblem-${glyph}`, matrices(aimed.pose));
}
/** Domain-only presentation context; target is evaluated from real camera/world
 * data here. Controller/native tests separately verify foreground/readiness. */
function semantic(runtime: ChapterRuntime, action: SealAction) {
  const candidate = evaluateInteraction(getWorld(runtime), runtime.pose, runtime.progress, matrices(runtime.pose));
  const result = reduceSeal(runtime.emblem, { sessionId: runtime.emblem.sessionId, seq: runtime.emblem.lastSeq + 1, nowMs: runtime.emblem.lastNowMs + 1001, action },
    { rendererReady: true, foreground: true, targetId: candidate.kind === 'ready' || candidate.kind === 'locked' ? candidate.target.id : null });
  return { result, runtime: commitEmblemResult(runtime, result) };
}
const variants = new Map<string, number>();
for (let seed = 0; seed < 1000 && variants.size < 6; seed += 1) {
  const stimulus = createSealStimulus(seed);
  variants.set(stimulus.answer + (stimulus.geometryKey.includes('-outer-') ? '-outer' : '-inner'), seed);
}

describe('emblem host-state integration and additive checkpoint migration', () => {
  it.each([...variants])('solves authored glyph/layer variant %s using world movement and glyphs', (_, seed) => {
    expect(variants.size).toBe(6);
    let runtime = atPanel(seed);
    const answer = createSealStimulus(seed).answer;
    const before = press(runtime, answer);
    expect(before.emblem.phase).toBe('unexamined');
    expect(before.progress.sealA).toBe(false);
    runtime = interact(runtime, 'emblem-panel', matrices(runtime.pose));
    const compared = semantic(runtime, { type: 'compare' }).runtime;
    expect(compared.progress.sealA).toBe(false);
    runtime = semantic(compared, { type: 'assist', enabled: true }).runtime;
    expect(runtime.progress.sealA).toBe(false);
    runtime = press(runtime, answer);
    expect(runtime.emblem).toMatchObject({ seed, phase: 'released' });
    expect(runtime.progress).toMatchObject({ guideExamined: false, markActivated: false, sealA: true, emblem: { seed, phase: 'released' } });
    for (let i = 0; i < 8; i += 1) runtime = evaluateRuntime(runtime, runtime.pose, 0.2);
    expect(runtime.doorAOpen).toBe(1);
    runtime = walk(walk(runtime, 0, -6), 0, -9);
    expect(runtime.pose.position.z).toBeLessThan(-8);
    expect(createInitialRuntime(restoreCheckpoint(createCheckpoint(runtime))!.checkpoint).emblem).toMatchObject({ seed, phase: 'released' });
  });
  it('keeps the answer after a wrong choice, inspection, comparison, hints and reload without losing progress', () => {
    let runtime = atPanel();
    runtime = interact(runtime, 'emblem-panel', matrices(runtime.pose));
    const answer = createSealStimulus(runtime.emblem.seed).answer;
    const wrong = EMBLEM_SWITCHES.find((item) => item.glyph !== answer)!.glyph;
    runtime = press(runtime, wrong);
    expect(runtime.progress.sealA).toBe(false);
    expect(runtime.emblem).toMatchObject({ phase: 'observing', attempts: 1, seed: 21 });
    expect(runtime.switchFeedback).toMatchObject({ glyph: wrong, correct: false, remainingSeconds: EMBLEM_SWITCH_FEEDBACK_SECONDS });
    runtime = evaluateRuntime(runtime, runtime.pose, 0.25);
    runtime = evaluateRuntime(runtime, runtime.pose, 0.25);
    expect(runtime.switchFeedback).toBeUndefined();
    runtime = aim(runtime, EMBLEM_FIXTURE.center);
    runtime = semantic(runtime, { type: 'compare' }).runtime;
    for (const stage of [1, 2, 3] as const) {
      runtime = setHintStage(runtime, stage);
      expect(runtime.progress.hintStage).toBe(stage);
      expect(runtime.emblem.hintTier).toBe(stage);
      expect(hintForRuntime(runtime).text.length).toBeGreaterThan(10);
    }
    const restored = restoreCheckpoint(createCheckpoint(runtime))!;
    expect(restored.emblemStatus).toBe('valid');
    const fresh = createInitialRuntime(restored.checkpoint);
    expect(fresh.emblem).toMatchObject({ phase: 'observing', seed: 21, attempts: 1, hintTier: 3, compared: true });
    expect(fresh.emblem.sessionId).not.toBe(runtime.emblem.sessionId);
    expect(createSealStimulus(fresh.emblem.seed).answer).toBe(answer);
    expect(press(aim(walk(fresh, 1.95, -5.8), EMBLEM_FIXTURE.center), answer).progress.sealA).toBe(true);
  });
  it('commits release once atomically and rejects stale reducer results from an old or duplicated session', () => {
    let runtime = atPanel();
    runtime = interact(runtime, 'emblem-panel', matrices(runtime.pose));
    const answer = createSealStimulus(runtime.emblem.seed).answer;
    runtime = aim(runtime, EMBLEM_SWITCHES.find((item) => item.glyph === answer)!.center);
    const { result, runtime: released } = semantic(runtime, { type: 'choose', glyph: answer });
    expect(result.effects.filter((effect) => effect.type === 'seal-released')).toHaveLength(1);
    expect(released.progress.emblem?.phase).toBe('released');
    expect(released.progress.sealA).toBe(true);
    expect(commitEmblemResult(released, result)).toBe(released);
    const newSession = createInitialRuntime(createCheckpoint(runtime));
    expect(commitEmblemResult(newSession, result)).toBe(newSession);
  });
  it('clears the first hint ladder on release and preserves later hints when comparing or changing assistance', () => {
    let runtime = setHintStage(atPanel(), 3);
    runtime = interact(runtime, 'emblem-panel', matrices(runtime.pose));
    runtime = press(runtime, createSealStimulus(runtime.emblem.seed).answer);
    expect(runtime.progress.hintStage).toBe(0);
    runtime = setHintStage(aim(runtime, EMBLEM_FIXTURE.center), 3);
    const keyHint = hintForRuntime(runtime).text;
    const compared = semantic(runtime, { type: 'compare' });
    expect(compared.result.accepted).toBe(true);
    expect(compared.runtime.progress.hintStage).toBe(3);
    runtime = semantic(compared.runtime, { type: 'assist', enabled: true }).runtime;
    expect(runtime.progress.hintStage).toBe(3);
    expect(hintForRuntime(runtime).text).toBe(keyHint);
    const resumed = createInitialRuntime(restoreCheckpoint(createCheckpoint(runtime))!.checkpoint);
    expect(resumed.progress.hintStage).toBe(3);
    expect(hintForRuntime(resumed).text).toBe(keyHint);
  });
  it('normalizes legacy first-puzzle hint counters to the restored emblem ladder', () => {
    const checkpoint = createCheckpoint(createInitialRuntime());
    const { emblem: _emblem, ...legacy } = checkpoint.progress;
    const restored = restoreCheckpoint({ ...checkpoint, progress: { ...legacy, hintStage: 3 } })!;
    expect(restored.emblemStatus).toBe('migrated');
    expect(restored.checkpoint.progress.hintStage).toBe(0);
    const resumed = createInitialRuntime(restored.checkpoint);
    expect(resumed.emblem.hintTier).toBe(0);
    const firstHint = setHintStage(resumed, 1);
    expect(firstHint.progress.hintStage).toBe(1);
    expect(firstHint.emblem.hintTier).toBe(1);
  });
  it('keeps the valid optional emblem hint tier authoritative before sealA on both restore routes', () => {
    const checkpoint = createCheckpoint(createInitialRuntime());
    const mismatch = { ...checkpoint, progress: { ...checkpoint.progress, hintStage: 0 as const,
      emblem: { ...checkpoint.progress.emblem!, hintTier: 2 as const } } };
    const restored = restoreCheckpoint(mismatch)!;
    expect(restored.emblemStatus).toBe('valid');
    expect(restored.checkpoint.progress.hintStage).toBe(2);
    expect(createInitialRuntime(restored.checkpoint).progress.hintStage).toBe(2);
    expect(createInitialRuntime(mismatch).progress.hintStage).toBe(2);
  });
  it('rejects paused interactions and requires current camera matrices on resumed emblem actions', () => {
    const runtime = atPanel();
    const paused = pauseRuntime(runtime);
    expect(interact(paused, 'emblem-panel', matrices(paused.pose))).toBe(paused);
    expect(interact(resumeRuntime(paused), 'emblem-panel').emblem.phase).toBe('unexamined');
    const resumed = resumeRuntime(paused);
    expect(interact(resumed, 'emblem-panel', matrices(resumed.pose)).emblem.phase).toBe('observing');
  });
  it('migrates legacy sealA saves as already released without resetting later flags or inert old flags', () => {
    const checkpoint = createCheckpoint(createInitialRuntime());
    const { emblem: _emblem, ...legacy } = checkpoint.progress;
    const progress = { ...legacy, guideExamined: true, markActivated: true, sealA: true, sealB: true, variant: 'exit' as const, exitDoorOpen: true };
    const restored = restoreCheckpoint({ ...checkpoint, progress })!;
    expect(restored.emblemStatus).toBe('migrated');
    expect(restored.checkpoint.progress).toMatchObject(progress);
    expect(restored.checkpoint.progress.emblem).toMatchObject({ seed: 21, phase: 'released' });
    expect(createInitialRuntime(restored.checkpoint).doorAOpen).toBe(1);
  });
  it('reports malformed, missing and unsupported optional fields while preserving otherwise valid checkpoints', () => {
    const checkpoint = createCheckpoint(createInitialRuntime());
    const { emblem: _emblem, ...legacy } = checkpoint.progress;
    expect(restoreCheckpoint({ ...checkpoint, progress: legacy })!.emblemStatus).toBe('migrated');
    for (const value of [null, { ...checkpoint.progress.emblem, seed: NaN }, { seed: 21 }, { ...checkpoint.progress.emblem, attempts: -1 }]) {
      const restored = restoreCheckpoint({ ...checkpoint, progress: { ...checkpoint.progress, emblem: value } })!;
      expect(restored.emblemStatus).toBe('invalid');
      expect(restored.checkpoint.progress.emblem).toMatchObject({ seed: 21, phase: 'unexamined' });
      expect(restored.checkpoint.progress.sealA).toBe(false);
    }
    const future = restoreCheckpoint({ ...checkpoint, progress: { ...checkpoint.progress, emblem: { schemaVersion: 42, seed: 700 } } })!;
    expect(future.emblemStatus).toBe('unsupported');
    expect(future.checkpoint.pose).toEqual(checkpoint.pose);
  });
  it('does not unlock a gate from a contradictory released optional checkpoint', () => {
    const checkpoint = createCheckpoint(createInitialRuntime());
    const restored = restoreCheckpoint({ ...checkpoint, progress: { ...checkpoint.progress, emblem: { ...checkpoint.progress.emblem, seed: 52, phase: 'released' } } })!;
    expect(restored.emblemStatus).toBe('invalid');
    expect(restored.checkpoint.progress).toMatchObject({ sealA: false, emblem: { seed: 52, phase: 'observing' } });
    expect(createInitialRuntime(restored.checkpoint).doorAOpen).toBe(0);
  });
});
