import { PerspectiveCamera } from 'three';
import { projectWithCamera } from '../../firstPerson/alignment';
import { createActorMotion, actorMotionEye, ACTOR_MOTION } from '../../actorMotion';
import { isSafePose, segmentOccluded, updatePlayer } from '../../firstPerson/geometry';
import type { ChapterRuntime, Vec3 } from '../../firstPerson/types';
import { vaultRuntime } from '../../../storage/testFixtures/vault';
import { advanceVaultActor, initialVaultActor, VAULT_AI, VAULT_ACTOR_ROUTE, vaultActorCanSeePlayer, vaultActorEdgeOpen, vaultNoiseAudibility } from '../actor';
import { createVaultCheckpoint, restoreVaultCheckpoint } from '../checkpoint';
import { VAULT_BRAKE_POSE, VAULT_EXIT_POSE, VAULT_SPAWN } from '../definition';
import { createVaultRuntime } from '../runtime';
import type { VaultActorPhase, VaultNoise } from '../types';
import { getVaultWorld } from '../world';

const phaseOf = (runtime: ChapterRuntime): VaultActorPhase => runtime.vault!.actor.phase;
const point = (x: number, z: number, y = 0): Vec3 => ({ x, y, z });
function player(runtime: ChapterRuntime, x: number, z: number, yaw = 0) {
  runtime.pose = { position: point(x, z, 1.6), yaw, pitch: 0 }; return runtime;
}
function active(position = point(2.3, 18), yaw = 0, stage: 'length' | 'rod' = 'length') {
  const runtime = vaultRuntime(stage);
  const p = runtime.progress.vault!;
  p.story.revealStarted = true; p.story.finalPursuitStarted = stage === 'rod';
  runtime.vault!.lengthGateOpen = 1; runtime.vault!.brakeGateOpen = Number(stage === 'rod');
  runtime.vault!.actor = { ...initialVaultActor(p), motion: createActorMotion(position, yaw), phase: 'patrol', startupGrace: 0, contactCooldown: 0, revealTime: VAULT_AI.revealSeconds };
  return runtime;
}
function cameraFor(runtime: ChapterRuntime) {
  const camera = new PerspectiveCamera(65, 390 / 844, .08, 60), p = runtime.pose;
  camera.position.set(p.position.x, p.position.y, p.position.z); camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
  return { view: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] };
}
function tick(runtime: ChapterRuntime, seconds: number, intensity: 'standard' | 'subdued' = 'standard') {
  let next = runtime; const events: string[] = [], phases: VaultActorPhase[] = [], searchIndices = new Set<number>();
  let movedDistance = 0;
  for (let time = 0; time < seconds - 1e-8; time += 1 / 60) {
    const result = advanceVaultActor(next, Math.min(1 / 60, seconds - time), { intensity });
    next = result.runtime; movedDistance += result.movedDistance; events.push(...result.events);
    const actor = next.vault!.actor;
    if (phases[phases.length - 1] !== actor.phase) phases.push(actor.phase);
    if (actor.phase === 'search' && actor.searchDwellSeconds > 0) searchIndices.add(actor.searchIndex);
  }
  return { runtime: next, events, phases, searchIndices, movedDistance };
}
const noise = (sequence: number, position: Vec3, strength = .8): VaultNoise => ({ sequence, position, strength, kind: 'footstep' });
function freeze(value: unknown) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
}

describe('new vault AI with authoritative shared motion', () => {
  it('starts its one reveal only after the first lock and exploration, without requiring a camera acknowledgement', () => {
    const locked = createVaultRuntime(); expect(tick(locked, 10).runtime).toBe(locked);
    let runtime = vaultRuntime('length'); runtime.vault!.mode = 'length';
    expect(tick(runtime, 10).runtime).toBe(runtime); runtime.vault!.mode = 'explore';
    const before = runtime.vault!.actor.motion.position;
    const first = advanceVaultActor(runtime, .05, { intensity: 'standard' }); runtime = first.runtime;
    expect(first.events).toEqual(['reveal']); expect(runtime.vault!.actor.motion.position).toEqual(before);
    expect(runtime.vault!.actor.motion.headYaw).not.toBe(0);
    const reveal = tick(runtime, 1.25); expect(reveal.events).not.toContain('caught');
    expect(reveal.runtime.vault!.actor.motion.position).toEqual(before);
    const missed = tick(reveal.runtime, 8);
    expect(missed.runtime.progress.vault!.story).toMatchObject({ revealStarted: true, revealPresented: false });
    expect(missed.events).not.toContain('reveal'); expect(missed.movedDistance).toBeGreaterThan(1);
    const restored = createVaultRuntime(restoreVaultCheckpoint(createVaultCheckpoint(missed.runtime))!.checkpoint);
    expect(tick(restored, 3).events).not.toContain('reveal');
  });

  it('lets a player in the initial bay glimpse the fixed head through real grille gaps while the covered body and closed passage stay blocked', () => {
    const runtime = createVaultRuntime(), world = getVaultWorld(runtime), goal = point(-.3, 3, 1.6);
    // The observation pose is reached by the same collision-resolved movement
    // from the real spawn; it is not a camera teleported through the grille.
    let pose = runtime.pose;
    for (let frame = 0; frame < 180; frame++) {
      const dx = goal.x - pose.position.x, dz = goal.z - pose.position.z, remaining = Math.hypot(dx, dz);
      if (remaining < .02) break;
      pose = updatePlayer({ ...pose, yaw: Math.atan2(-dx, -dz), pitch: 0 }, { forward: 1, strafe: 0 }, Math.min(1 / 60, remaining / 2.15), world);
    }
    expect(Math.hypot(pose.position.x - goal.x, pose.position.z - goal.z)).toBeLessThan(.02);
    expect(isSafePose(pose, world)).toBe(true);
    const head = actorMotionEye(runtime.vault!.actor.motion).position, actor = runtime.vault!.actor.motion.position;
    const dx = head.x - pose.position.x, dz = head.z - pose.position.z;
    runtime.pose = { ...pose, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(head.y - pose.position.y, Math.hypot(dx, dz)) };
    expect(segmentOccluded(runtime.pose.position, head, world)).toBe(false);
    expect(projectWithCamera(head, cameraFor(runtime))).toBeDefined();
    expect(segmentOccluded(runtime.pose.position, { ...actor, y: 1 }, world)).toBe(true);
    expect(segmentOccluded(runtime.pose.position, { ...actor, y: .1 }, world)).toBe(true);
    expect(advanceVaultActor(runtime, .05, { intensity: 'standard', matrices: cameraFor(runtime) }).runtime).toBe(runtime);
    expect(runtime.progress.vault!.story).toEqual({ revealStarted: false, revealPresented: false, finalPursuitStarted: false });
    expect(world.solids.filter(s => s.id.startsWith('vault-length-grille-bar-'))).toHaveLength(5);
    expect(world.solids.find(s => s.id === 'vault-length-grille-bar-0')!.min.y).toBe(0);
    const opened = active();
    for (const x of [-.6, -.2, .2, .6]) {
      const start = { position: point(x, 4.55, 1.6), yaw: Math.PI, pitch: 0 };
      expect(isSafePose(start, world)).toBe(true);
      let closedPose = start, openPose = start;
      for (let frame = 0; frame < 60; frame++) {
        closedPose = updatePlayer(closedPose, { forward: 1, strafe: 0 }, 1 / 60, world);
        openPose = updatePlayer(openPose, { forward: 1, strafe: 0 }, 1 / 60, getVaultWorld(opened));
      }
      expect(closedPose.position.z).toBeLessThan(4.8); expect(openPose.position.z).toBeGreaterThan(6);
    }
  });

  it('records possible reveal presentation only through the actual matching camera and unblocked head', () => {
    let runtime = vaultRuntime('length'); runtime.vault!.lengthGateOpen = 1;
    player(runtime, 2.5, 5.8, Math.PI);
    const actor = runtime.vault!.actor.motion.position;
    expect(segmentOccluded(runtime.pose.position, { ...actor, y: 1.95 }, getVaultWorld(runtime))).toBe(false);
    const mismatched = { ...cameraFor(runtime), view: cameraFor(createVaultRuntime()).view };
    expect(advanceVaultActor(runtime, .05, { intensity: 'standard', matrices: mismatched }).runtime.progress.vault!.story.revealPresented).toBe(false);
    runtime = advanceVaultActor(runtime, .05, { intensity: 'standard', matrices: cameraFor(runtime) }).runtime;
    expect(runtime.progress.vault!.story.revealPresented).toBe(true);
  });

  it('uses the actual head and eye for finite recognition, never desired heading or wall-hidden player coordinates', () => {
    let runtime = player(active(point(2.3, 18), 0), 2.3, 16.7);
    expect(vaultActorCanSeePlayer(runtime)).toBe(true);
    runtime.vault!.actor.motion.desiredHeading = Math.PI;
    expect(vaultActorCanSeePlayer(runtime)).toBe(true);
    runtime.vault!.actor.motion = createActorMotion(point(2.3, 18), Math.PI);
    runtime.vault!.actor.motion.desiredHeading = 0;
    expect(vaultActorCanSeePlayer(runtime)).toBe(false);
    runtime.vault!.actor.motion = createActorMotion(point(2.3, 18), 0);
    const before = tick(runtime, .35); expect(before.phases).not.toContain('notice');
    const recognized = tick(before.runtime, .2); expect(recognized.phases).toContain('notice'); expect(recognized.events).toContain('noticed');
    runtime = player(active(point(-2.2, 11.5), -Math.PI / 2), 2.3, 11.5);
    expect(vaultActorCanSeePlayer(runtime)).toBe(false); expect(tick(runtime, .2).runtime.vault!.actor.lastSeen).toBeUndefined();
  });

  it('investigates a new rapid footstep behind it while quiet walking stays below threshold, independent of speaker playback', () => {
    const runtime = player(active(point(-2.2, 8), 0), -2.2, 8.9), source = runtime.pose.position;
    expect(vaultActorCanSeePlayer(runtime)).toBe(false);
    const fast = advanceVaultActor(runtime, .05, { intensity: 'standard', noise: noise(1, source) });
    expect(fast.runtime.vault!.actor.phase).toBe('investigate'); expect(fast.runtime.vault!.actor.lastHeard).toEqual(source);
    expect(fast.runtime.vault!.actor.motion.headYaw).not.toBe(0);
    const slow = advanceVaultActor(runtime, .05, { intensity: 'standard', noise: noise(1, source, .1) });
    expect(slow.runtime.vault!.actor.phase).not.toBe('investigate'); expect(slow.runtime.vault!.actor.lastHeard).toBeUndefined();
    // Audio is deliberately absent from this API; the same game event is the
    // complete hearing input for muted and audible controller sessions.
    expect(advanceVaultActor(runtime, .05, { intensity: 'standard', noise: noise(1, source) })).toEqual(fast);
  });

  it('attenuates hearing through real shelves and consumes quiet/invalid/stale events without inventing a heard position', () => {
    let runtime = active(point(-2.2, 11.5)), world = getVaultWorld(runtime);
    const hidden = noise(2, point(2.2, 11.5, 1.6));
    expect(vaultNoiseAudibility(runtime.vault!.actor, hidden, world)).toBeLessThan(VAULT_AI.noiseThreshold);
    const clear = { ...world, solids: [] };
    expect(vaultNoiseAudibility(runtime.vault!.actor, hidden, clear)).toBeCloseTo(vaultNoiseAudibility(runtime.vault!.actor, hidden, world) / VAULT_AI.occludedNoiseGain, 12);
    runtime = advanceVaultActor(runtime, .05, { intensity: 'standard', noise: hidden }).runtime;
    expect(runtime.vault!.actor.lastNoiseSequence).toBe(2); expect(runtime.vault!.actor.lastHeard).toBeUndefined();
    for (const invalid of [noise(2, point(-2.2, 12, 1.6)), noise(1, point(-2.2, 12, 1.6)), noise(NaN, point(-2.2, 12, 1.6)), noise(3, point(NaN, 12, 1.6)), { ...noise(4, point(-2.2, 12, 1.6)), kind: 'menu' as VaultNoise['kind'] }]) {
      runtime = advanceVaultActor(runtime, .05, { intensity: 'standard', noise: invalid }).runtime;
      expect(runtime.vault!.actor.lastHeard).toBeUndefined();
    }
  });

  it('goes to only the remembered last seen point, checks multiple edges there, and returns after losing the player behind the rack', () => {
    let runtime = player(active(point(2.3, 11.5), 0), 2.3, 9.5);
    runtime.vault!.actor.phase = 'pursue'; runtime = tick(runtime, .05).runtime;
    const remembered = runtime.vault!.actor.lastSeen;
    expect(remembered).toEqual(runtime.pose.position);
    runtime = player(runtime, -2.2, 11.5);
    expect(vaultActorCanSeePlayer(runtime)).toBe(false);
    const search = tick(runtime, 13);
    expect(search.phases).toEqual(expect.arrayContaining(['search', 'return', 'patrol']));
    expect([...search.searchIndices]).toEqual([0, 1, 2]);
    expect(search.runtime.vault!.actor.lastSeen).toEqual(remembered);
    expect(search.events).not.toContain('caught');
  });

  it('does not spend its search dwell time while still travelling to a distant observed position', () => {
    const runtime = active(point(-2.2, 8)); runtime.vault!.actor.phase = 'search';
    runtime.vault!.actor.lastSeen = point(-2.2, 15.5, 1.6); runtime.vault!.actor.searchOrigin = point(-2.2, 15.5, 1.6);
    const travelling = tick(runtime, 8);
    expect(travelling.runtime.vault!.actor.phase).toBe('search'); expect(travelling.runtime.vault!.actor.searchDwellSeconds).toBe(0);
    expect(travelling.runtime.vault!.actor.motion.position.z).toBeLessThan(15);
    const searched = tick(travelling.runtime, 15);
    expect(searched.phases).toContain('return'); expect([...searched.searchIndices]).toEqual([0, 1, 2]);
  });

  it('uses real body clearance on both shelf routes, closed gates, and the narrow physically safe brake grille', () => {
    const runtime = active(point(2.5, 8.5), 0, 'rod'), world = getVaultWorld(runtime);
    expect(VAULT_ACTOR_ROUTE).toHaveLength(12);
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0], [7, 10], [10, 11]]) expect(vaultActorEdgeOpen(VAULT_ACTOR_ROUTE[a!]!, VAULT_ACTOR_ROUTE[b!]!, world)).toBe(true);
    expect(vaultActorEdgeOpen(point(-3.1, 18.5), point(-4.6, 18.5), world)).toBe(false);
    let pose = { position: point(-3.1, 18.5, 1.6), yaw: Math.PI / 2, pitch: 0 };
    for (let i = 0; i < 60; i++) pose = updatePlayer(pose, { forward: 1, strafe: 0 }, .05, world);
    expect(pose.position.x).toBeLessThan(-4.6);
    runtime.vault!.brakeGateOpen = 0;
    expect(vaultActorEdgeOpen(VAULT_ACTOR_ROUTE[7]!, VAULT_ACTOR_ROUTE[10]!, getVaultWorld(runtime))).toBe(false);
    runtime.vault!.partitionClosed = true;
    expect(vaultActorEdgeOpen(VAULT_ACTOR_ROUTE[10]!, VAULT_ACTOR_ROUTE[11]!, getVaultWorld(runtime))).toBe(false);
  });

  it('accelerates to a measured pursuit speed above player maximum and bounds each displacement without teleporting', () => {
    let runtime = player(active(point(-2.2, 8), Math.PI), -2.2, 12.5);
    runtime.vault!.actor.phase = 'pursue'; runtime.vault!.actor.recognition = 1;
    let steadyDistance = 0, steadySeconds = 0;
    for (let i = 0; i < 120; i++) {
      const before = runtime.vault!.actor.motion.position;
      // A visible player moves along the real west lane at 2.15 m/s.
      runtime.pose = { ...runtime.pose, position: point(-2.2, 12.5 + i / 60 * 2.15, 1.6) };
      const result = advanceVaultActor(runtime, 1 / 60, { intensity: 'standard' }); runtime = result.runtime;
      const after = runtime.vault!.actor.motion.position;
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThanOrEqual(VAULT_AI.pursueSpeed / 60 + 1e-8);
      if (i >= 75) { steadyDistance += result.movedDistance; steadySeconds += 1 / 60; }
    }
    expect(runtime.vault!.actor.phase).toBe('pursue'); expect(steadyDistance / steadySeconds).toBeCloseTo(2.35, 5);
    expect(steadyDistance / steadySeconds).toBeGreaterThan(2.15);
  });

  it('has an explicit windup, commits one non-homing target, and misses a lateral dodge before recovery', () => {
    let runtime = player(active(point(2.3, 18), Math.PI), 2.3, 19.2);
    runtime.vault!.actor.phase = 'pursue'; runtime.vault!.actor.recognition = 1;
    let windupTime = 0, started = false;
    for (let i = 0; i < 180 && phaseOf(runtime) !== 'attack'; i++) {
      const result = advanceVaultActor(runtime, 1 / 60, { intensity: 'standard' }); runtime = result.runtime;
      expect(result.caught).toBe(false);
      if (phaseOf(runtime) === 'windup') { started = true; windupTime += 1 / 60; }
    }
    expect(started).toBe(true); expect(windupTime).toBeGreaterThanOrEqual(.75 - 1e-8);
    const committed = runtime.vault!.actor.attackTarget!; expect(committed).toEqual(point(2.3, 19.2, 1.6));
    runtime = player(runtime, 3.45, 19.2);
    const dodged = tick(runtime, .6);
    expect(dodged.events).not.toContain('caught'); expect(dodged.phases).toContain('recover');
    expect(dodged.runtime.vault!.actor.attackTarget).toEqual(committed);
    expect(dodged.runtime.vault!.actor.motion.position.x).toBeCloseTo(2.3, 4);
  });

  it('catches once after windup and restores the last visited authorized refuge without changing progress or replaying story', () => {
    let runtime = player(active(point(2.3, 18), Math.PI), 2.3, 19.2);
    runtime.vault!.lastSafePose = VAULT_BRAKE_POSE; runtime.vault!.actor.phase = 'pursue'; runtime.vault!.actor.recognition = 1;
    const progress = JSON.parse(JSON.stringify(runtime.progress));
    const result = tick(runtime, 2.3); runtime = result.runtime;
    expect(result.events.filter(event => event === 'caught')).toHaveLength(1);
    expect(result.phases).toEqual(expect.arrayContaining(['windup', 'attack', 'recover']));
    expect(runtime.pose).toEqual(VAULT_BRAKE_POSE); expect(runtime.progress).toEqual(progress);
    expect(runtime.vault!.actor.startupGrace).toBeGreaterThan(2); expect(runtime.vault!.actor.contactCooldown).toBeGreaterThan(2);
    expect(tick(runtime, 2).events).not.toContain('caught');
    const cp = createVaultCheckpoint(runtime), resumed = createVaultRuntime(restoreVaultCheckpoint(cp)!.checkpoint);
    expect(resumed.pose).toEqual(runtime.pose); expect(resumed.vault!.actor.phase).toBe('idle');
    expect(resumed.vault!.actor.startupGrace).toBe(VAULT_AI.coldGrace); expect(resumed.vault!.actor.lastSeen).toBeUndefined();
    expect(JSON.stringify(cp)).not.toMatch(/phaseTime|searchDwellSeconds|attackTarget|plantSequence|lastHeard/);
  });

  it('cannot hit through the real shut partition, inside the brake grille, or beyond the final refuge', () => {
    for (const [actorPosition, pose, partition] of [[point(3, 23.38), { position: point(3, 24.02, 1.6), yaw: 0, pitch: 0 }, true],
      [point(-3.1, 18.5), VAULT_BRAKE_POSE, false], [point(3, 27.85), VAULT_EXIT_POSE, false]] as const) {
      let runtime = active(actorPosition, Math.PI, 'rod'); runtime.pose = pose; runtime.vault!.partitionClosed = partition;
      runtime.vault!.actor = { ...runtime.vault!.actor, phase: 'attack', attackCommitted: true, attackTarget: { ...pose.position } };
      const result = tick(runtime, .4); runtime = result.runtime;
      expect(result.events).not.toContain('caught'); expect(runtime.pose).toEqual(pose);
      if (partition) expect(runtime.vault!.actor.motion.position.z).toBeLessThan(23.7);
    }
  });

  it('freezes an in-session attack and memory without refreshing grace, while cold resume and contact recovery are separate', () => {
    const runtime = player(active(point(2.3, 18), Math.PI), 2.3, 19.2);
    runtime.vault!.actor = { ...runtime.vault!.actor, phase: 'windup', phaseTime: .55, lastSeen: point(2.3, 19.2, 1.6), lastHeard: point(3, 17, 1.6) };
    for (const frozen of [{ ...runtime, paused: true }, { ...runtime, vault: { ...runtime.vault!, mode: 'rod' as const } }]) {
      expect(tick(frozen, 30).runtime).toBe(frozen); expect(frozen.vault!.actor.phaseTime).toBe(.55);
      expect(frozen.vault!.actor.startupGrace).toBe(0); expect(frozen.vault!.actor.lastHeard).toEqual(point(3, 17, 1.6));
    }
    const resumed = tick(runtime, .1).runtime;
    expect(resumed.vault!.actor.phase).toBe('windup'); expect(resumed.vault!.actor.phaseTime).toBeCloseTo(.65, 8);
    expect(resumed.vault!.actor.startupGrace).toBe(0);
    expect(tick(resumed, .12).runtime.vault!.actor.phase).toBe('attack');
  });

  it('keeps subdued presence and collision while disabling pursue, attacks and catches, then grants a safe explicit intensity change', () => {
    let runtime = player(active(point(2.3, 18), Math.PI), 2.3, 19.2);
    runtime.vault!.actor = { ...runtime.vault!.actor, phase: 'attack', attackCommitted: true, attackTarget: { ...runtime.pose.position } };
    const quiet = tick(runtime, 4, 'subdued'); runtime = quiet.runtime;
    expect(quiet.events).not.toContain('caught'); expect(quiet.phases).not.toEqual(expect.arrayContaining(['pursue', 'attack']));
    expect(runtime.vault!.actor.visible).toBe(true); expect(getVaultWorld(runtime).solids.some(s => s.id === 'vault-actor-body')).toBe(true);
    const before = runtime.vault!.actor.motion.position;
    const standard = advanceVaultActor(runtime, .05, { intensity: 'standard' });
    expect(standard.caught).toBe(false); expect(standard.runtime.vault!.actor.startupGrace).toBe(VAULT_AI.coldGrace);
    expect(Math.hypot(standard.runtime.vault!.actor.motion.position.x - before.x, standard.runtime.vault!.actor.motion.position.z - before.z)).toBeLessThan(.05);
  });

  it('allows a physically blocked subdued actor to step away from a close player instead of deadlocking both bodies', () => {
    let runtime = player(active(point(.72, 8.14), Math.PI / 2), .8, 7.45);
    runtime.vault!.actor.intensity = 'subdued'; runtime.vault!.actor.routeIndex = 1;
    const before = runtime.vault!.actor.motion.position;
    const result = tick(runtime, 4, 'subdued'); runtime = result.runtime;
    expect(result.events).not.toContain('caught');
    expect(runtime.vault!.actor.motion.position.x).toBeLessThan(before.x - .4);
    expect(Math.hypot(runtime.vault!.actor.motion.position.x - runtime.pose.position.x, runtime.vault!.actor.motion.position.z - runtime.pose.position.z)).toBeGreaterThan(.71);
  });

  it('keeps actor progress, position, feet and event production immutable for presentation rollback', () => {
    const runtime = player(active(point(-2.2, 8), 0), -2.2, 8.9), before = JSON.stringify(runtime); freeze(runtime);
    const result = advanceVaultActor(runtime, .05, { intensity: 'standard', noise: noise(1, runtime.pose.position) });
    expect(JSON.stringify(runtime)).toBe(before); expect(result.runtime).not.toBe(runtime);
    expect(result.runtime.vault!.actor.motion.feet).not.toBe(runtime.vault!.actor.motion.feet);
    for (const dt of [0, -1, NaN, Infinity]) expect(advanceVaultActor(runtime, dt, { intensity: 'standard' }).runtime).toBe(runtime);
    const huge = advanceVaultActor(runtime, 1000, { intensity: 'standard' });
    expect(huge.movedDistance).toBeLessThanOrEqual(.05 * VAULT_AI.pursueSpeed);
    expect(Math.abs(huge.runtime.vault!.actor.motion.angularVelocity)).toBeLessThanOrEqual(ACTOR_MOTION.bodyMaxYawRate);
    const eye = actorMotionEye(huge.runtime.vault!.actor.motion); expect(Object.values(eye.position).every(Number.isFinite)).toBe(true);
    expect(VAULT_SPAWN.position.y).toBe(1.6);
  });
});
