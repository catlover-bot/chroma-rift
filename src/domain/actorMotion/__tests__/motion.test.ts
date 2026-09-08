import { ACTOR_MOTION as C, actorFootLocal, actorLegKnee, actorMotionEye, advanceActorMotion, createActorMotion, rotateActorXZ, sampleActorPose, wrapActorAngle, type ActorFootPlant, type ActorMotionIntent } from '..';
const origin = { x: 0, y: 0, z: 0 }, open = () => true;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
function intentAt(time: number): ActorMotionIntent {
  if (time < 3) return { desiredHeading: Math.PI, maxSpeed: 0, gait: 'listen' };
  if (time < 7) return { target: { x: 0, y: 0, z: 5 }, maxSpeed: .84, gait: 'patrol' };
  if (time < 11) return { target: { x: 4, y: 0, z: 3 }, maxSpeed: 1.25, gait: 'pursue' };
  return { maxSpeed: 0, gait: 'idle' };
}
function sequence(deltas: readonly number[]) {
  let state = createActorMotion(origin), time = 0, index = 0;
  const plants: ActorFootPlant[] = []; let slip = 0, soleRadius = 0;
  while (time < 12 - 1e-9) {
    // Split at authored intention boundaries, as event-driven behavior does.
    const boundary = time < 3 - 1e-9 ? 3 : time < 7 - 1e-9 ? 7 : time < 11 - 1e-9 ? 11 : 12;
    const dt = Math.min(deltas[index++ % deltas.length]!, boundary - time);
    const previous = state, result = advanceActorMotion(state, intentAt(time + 1e-9), dt, open);
    state = result.state; plants.push(...result.footPlants);
    for (const footIndex of [0, 1] as const) {
      const foot = state.feet[footIndex], oldFoot = previous.feet[footIndex];
      if (foot.stance && oldFoot.stance && foot.anchor.x === oldFoot.anchor.x && foot.anchor.z === oldFoot.anchor.z) {
        slip = Math.max(slip, Math.hypot(foot.position.x - oldFoot.position.x, foot.position.z - oldFoot.position.z));
        expect(foot.yaw).toBe(oldFoot.yaw);
      }
      const local = actorFootLocal(state, footIndex), world = rotateActorXZ(local.position, state.yaw);
      expect(world.x + state.position.x).toBeCloseTo(foot.position.x, 11);
      expect(world.z + state.position.z).toBeCloseTo(foot.position.z, 11);
      // The same 14cm x 27cm sole geometry that GalleryActor actually renders.
      for (const x of [-.07, .07]) for (const z of [-.135, .135]) {
        const corner = rotateActorXZ({ x, y: 0, z }, foot.yaw);
        soleRadius = Math.max(soleRadius, Math.hypot(foot.position.x + corner.x - state.position.x, foot.position.z + corner.z - state.position.z));
      }
    }
    time += dt;
  }
  return { state, plants, slip, soleRadius };
}
describe('one authoritative bounded locomotion and grounded body', () => {
  it.each([[0, Math.PI], [0, -Math.PI], [Math.PI - .02, -Math.PI + .2], [-Math.PI + .02, Math.PI - .2]])('limits angular velocity and acceleration from %s to %s, including wrap', (from, to) => {
    let state = createActorMotion(origin, from);
    for (let frame = 0; frame < 600; frame++) {
      const old = state; state = advanceActorMotion(state, { desiredHeading: to, maxSpeed: 0, gait: 'listen' }, 1 / 120, open).state;
      expect(Math.abs(wrapActorAngle(state.yaw - old.yaw)) * 120).toBeLessThanOrEqual(C.bodyMaxYawRate + 1e-10);
      expect(Math.abs(state.angularVelocity - old.angularVelocity) * 120).toBeLessThanOrEqual(C.bodyMaxYawAcceleration + 1e-10);
      expect(Math.abs(state.headYaw)).toBeLessThanOrEqual(C.headYawLimit + 1e-12);
      expect(Math.abs(state.chestYaw)).toBeLessThanOrEqual(C.chestYawLimit + 1e-12);
    }
    expect(Math.abs(wrapActorAngle(to - state.yaw))).toBeLessThan(.002);
  });
  it('moves the actual head before chest and pelvis, and uses that eye direction rather than desired heading', () => {
    let state = createActorMotion(origin), head = Infinity, chest = Infinity, pelvis = Infinity;
    for (let frame = 1; frame <= 120; frame++) {
      state = advanceActorMotion(state, { desiredHeading: Math.PI / 2, maxSpeed: 0, gait: 'notice' }, 1 / 120, open).state;
      if (Math.abs(state.headYaw) > .001) head = Math.min(head, frame / 120);
      if (Math.abs(state.chestYaw) > .001) chest = Math.min(chest, frame / 120);
      if (Math.abs(state.yaw) > .001) pelvis = Math.min(pelvis, frame / 120);
      const eye = actorMotionEye(state);
      expect(eye.yaw).toBeCloseTo(wrapActorAngle(state.yaw + sampleActorPose(state).headYaw), 12);
      if (frame < 12) expect(Math.abs(wrapActorAngle(eye.yaw - state.desiredHeading))).toBeGreaterThan(1);
    }
    expect(head).toBeLessThan(chest); expect(chest).toBeLessThan(pelvis);
    expect(chest - head).toBeGreaterThanOrEqual(.12); expect(chest - head).toBeLessThanOrEqual(.25);
    expect(pelvis).toBeGreaterThanOrEqual(C.pelvisDelay);
  });
  it('produces equal 30/60/120Hz trajectories, phases and contacts, with variable frame delta within one simulation step', () => {
    const reference = sequence([1 / 120]);
    for (const steps of [[1 / 60], [1 / 30], [.011, .023, .041, .008, .017]]) {
      const result = sequence(steps);
      expect(result.state.position).toEqual(reference.state.position);
      expect(result.state.yaw).toBe(reference.state.yaw); expect(result.state.plantSequence).toBe(reference.state.plantSequence);
      expect(result.plants).toEqual(reference.plants); expect(result.state.feet).toEqual(reference.state.feet);
      expect(result.slip).toBeLessThan(.02); expect(result.soleRadius).toBeLessThan(.44);
    }
    expect(reference.plants.length).toBeGreaterThan(20); expect(reference.slip).toBe(0);
  });
  it('keeps straight/90-degree turn/stop stance anchors and sole corners fixed, and replants for large turns', () => {
    const result = sequence([1 / 120]);
    expect(result.slip).toBe(0); expect(result.soleRadius).toBeLessThan(.44);
    expect(result.state.feet.every(foot => foot.stance && foot.position.y === 0)).toBe(true);
    expect(result.plants.every((plant, index) => plant.sequence === index + 1 && plant.position.y === 0)).toBe(true);
    for (const foot of result.state.feet) expect(foot.position).toEqual(foot.anchor);
  });
  it('does not mutate a speculative prior frame or advance paused/invalid time, and settles a stop without looping footsteps', () => {
    const initial = freeze(createActorMotion(origin)), snapshot = JSON.stringify(initial);
    const walking = advanceActorMotion(initial, { target: { x: 0, y: 0, z: -4 }, maxSpeed: .84, gait: 'patrol' }, .25, open);
    expect(JSON.stringify(initial)).toBe(snapshot); expect(walking.state).not.toBe(initial);
    for (const dt of [0, -1, NaN]) expect(advanceActorMotion(walking.state, { maxSpeed: 0, gait: 'idle' }, dt, open).state).toBe(walking.state);
    const stopped = sequence([1 / 60]).state, idle = { maxSpeed: 0, gait: 'idle' as const };
    const next = advanceActorMotion(freeze(stopped), idle, .25, open);
    expect(next.footPlants).toEqual([]); expect(next.state.feet).toEqual(stopped.feet);
    expect(advanceActorMotion(stopped, idle, 200, open)).toEqual(advanceActorMotion(stopped, idle, .25, open));
  });
  it('decelerates an in-flight walking stop through the authoritative root and settles both feet', () => {
    let state = createActorMotion(origin);
    for (let frame = 0; frame < 180; frame++) state = advanceActorMotion(state, { target: { x: 0, y: 0, z: -10 }, maxSpeed: .84, gait: 'patrol' }, 1 / 60, open).state;
    const before = state, first = advanceActorMotion(state, { maxSpeed: 0, gait: 'idle' }, 1 / 60, open);
    expect(first.movedDistance).toBeGreaterThan(0); expect(first.state.speed).toBeGreaterThan(0);
    expect(first.state.speed).toBeCloseTo(before.speed - C.linearDeceleration / 60, 10);
    state = first.state;
    for (let frame = 0; frame < 60; frame++) state = advanceActorMotion(state, { maxSpeed: 0, gait: 'idle' }, 1 / 60, open).state;
    expect(state.speed).toBe(0); expect(state.feet.every(foot => foot.stance)).toBe(true);
    expect(Math.hypot(state.position.x - before.position.x, state.position.z - before.position.z)).toBeLessThanOrEqual(before.speed ** 2 / (2 * C.linearDeceleration));
    expect(advanceActorMotion(state, { maxSpeed: 0, gait: 'idle' }, .25, open).footPlants).toEqual([]);
  });
  it('achieves each chapter-authored speed in real displacement while the support feet stay inside the body envelope', () => {
    for (const speed of [.72, .84, 1.25, 2.35]) {
      let state = createActorMotion(origin), atTwoSeconds = 0, maximumSoleRadius = 0;
      for (let frame = 0; frame < 1200; frame++) {
        state = advanceActorMotion(state, { target: { x: 0, y: 0, z: -100 }, maxSpeed: speed, gait: speed > 1.5 ? 'pursue' : 'patrol' }, 1 / 120, open).state;
        if (frame === 239) atTwoSeconds = state.travelledDistance;
        for (const foot of state.feet) for (const x of [-.07, .07]) for (const z of [-.135, .135]) {
          const corner = rotateActorXZ({ x, y: 0, z }, foot.yaw);
          maximumSoleRadius = Math.max(maximumSoleRadius, Math.hypot(foot.position.x + corner.x - state.position.x, foot.position.z + corner.z - state.position.z));
        }
      }
      expect((state.travelledDistance - atTwoSeconds) / 8).toBeCloseTo(speed, 9);
      expect(maximumSoleRadius).toBeLessThan(.44);
    }
  });
  it('keeps the body behind collision and never fabricates a walking footstep for an immovable root', () => {
    let state = createActorMotion(origin);
    const plants: ActorFootPlant[] = [];
    for (let i = 0; i < 240; i++) {
      const step = advanceActorMotion(state, { target: { x: 0, y: 0, z: -4 }, maxSpeed: 2.4, gait: 'pursue' }, 1 / 60, () => false);
      state = step.state; plants.push(...step.footPlants);
    }
    expect(state.position).toEqual(origin); expect(state.travelledDistance).toBe(0); expect(state.speed).toBe(0); expect(plants).toEqual([]);
  });
  it('solves equal two-link legs from authoritative feet and bounds all authored gait poses', () => {
    for (const gait of ['idle', 'listen', 'patrol', 'investigate', 'notice', 'pursue', 'windup', 'attack', 'recover', 'search', 'return'] as const) {
      let state = createActorMotion(origin);
      for (let frame = 0; frame < 240; frame++) {
        state = advanceActorMotion(state, { target: { x: 0, y: 0, z: -20 }, maxSpeed: gait === 'pursue' ? 2.4 : .84, gait }, 1 / 120, open).state;
        const pose = sampleActorPose(state);
        for (const [side, foot] of [[-1, pose.leftFoot], [1, pose.rightFoot]] as const) {
          const hip = { x: side * .105 + pose.pelvisShift, y: .87, z: .02 }, ankle = { x: foot.position.x, y: .14 + foot.position.y, z: foot.position.z };
          const knee = actorLegKnee(hip, ankle);
          expect(Math.hypot(knee.x - hip.x, knee.y - hip.y, knee.z - hip.z)).toBeCloseTo(.42, 10);
          expect(Math.hypot(knee.x - ankle.x, knee.y - ankle.y, knee.z - ankle.z)).toBeCloseTo(.42, 10);
          expect(foot.position.y).toBeGreaterThanOrEqual(0);
        }
        expect(Math.abs(pose.pelvisShift)).toBeLessThanOrEqual(.012);
        expect(Object.values(actorMotionEye(state).direction).every(Number.isFinite)).toBe(true);
      }
    }
  });
});
