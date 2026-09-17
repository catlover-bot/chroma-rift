import * as THREE from 'three';
import { createCheckpoint } from '../src/domain/firstPerson/checkpoint';
import { inspectPoseSafety, isSafePose, MOVE_SPEED, segmentOccluded } from '../src/domain/firstPerson/geometry';
import type { Vec3 } from '../src/domain/firstPerson/types';
import { FIGURE_CENTER, KEY_CENTER, PRACTICE_CENTER, SHELTER_SAFE, WINCH_CENTER } from '../src/domain/stages/mirror-corridor-v1/definition';
import { isStageSession, type StageSession } from '../src/domain/stages/mirror-corridor-v1/session';
import { advanceController, beginStageHoldController, commandController, controllerSnapshot, createController,
  endStageHoldController, flushControllerAudioFrame, interactController, presentControllerRecovery, syncCamera,
  worldForController, type RuntimeController } from '../src/rendering/firstPerson/runtimeController';

export type MirrorRouteOptions = {
  initialWait: number; work: readonly [number, number]; reaction: .75 | 1.25 | 1.75;
  deltas: readonly number[]; retreat: boolean; intensity?: 'standard' | 'subdued';
};
export type MirrorRouteEvent = { name: string; time: number; pose: Vec3; ratchets: number; gateLift: number;
  enemyPhase: string; enemy: Vec3; blockers: string[]; holding: StageSession['holding'];
  pointers: { move: number | string | null; barrier: readonly (number | string)[] }; detail?: unknown };

/** Controller input fixture with an explicit successful-presentation boundary.
 * No native GL/audio or human perception is claimed. Enemy phase/memory is
 * recorded only; decisions use timed input, visible geometry and foot plants. */
export class MirrorFairRoute {
  readonly controller: RuntimeController;
  readonly camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
  readonly events: MirrorRouteEvent[] = [];
  time = 0;
  distanceWalked = 0;
  captures = 0;
  firstDangerCue: number | undefined;
  private observingDeparture = false;
  private previousPlantRange: number | undefined;
  private departingCue: { time: number; range: number; previousRange: number } | undefined;
  private working = false;
  private frame = 0;
  constructor(readonly options: MirrorRouteOptions) {
    this.controller = createController(undefined, false, true, 'mirror-corridor-v1');
    this.controller.horrorIntensity = options.intensity ?? 'standard';
    this.controller.viewport = { width: 390, height: 844 };
    Object.assign(this.controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
      sceneMode: 'chapter', paused: false, open: false, renderReturns: 1, presentationReturns: 1 });
    syncCamera(this.controller, this.camera);
    this.assertSafe('entry');
  }
  get session(): StageSession {
    const value = this.controller.runtime.stageSession?.value;
    if (!isStageSession(value)) throw new Error('Mirror route lost its actual stage session');
    return value;
  }
  mark(name: string, detail?: unknown) {
    const session = this.session, input = this.controller.input;
    this.events.push({ name, time: this.time, pose: { ...this.controller.runtime.pose.position }, ratchets: session.ratchets,
      gateLift: session.gateLift, enemyPhase: session.actor.phase, enemy: { ...session.actor.motion.position },
      blockers: inspectPoseSafety(this.controller.runtime.pose, worldForController(this.controller)).intersectingSolidIds,
      holding: session.holding, pointers: { move: input.stickPointer, barrier: [...input.releaseBarrier] }, ...(detail === undefined ? {} : { detail }) });
  }
  assertSafe(context: string) {
    if (!isSafePose(this.controller.runtime.pose, worldForController(this.controller))) {
      this.mark('unsafe', context); throw new Error(`Unsafe mirror route pose at ${context}: ${JSON.stringify(this.events.at(-1))}`);
    }
  }
  tick(maxDelta = .05) {
    const dt = Math.min(this.options.deltas[this.frame++ % this.options.deltas.length]!, maxDelta);
    const before = this.controller.runtime.pose.position, prior = this.session;
    advanceController(this.controller, dt, this.camera);
    this.time += dt;
    const caught = this.controller.pendingActorEvents.includes('caught');
    if (!caught) this.distanceWalked += Math.hypot(this.controller.runtime.pose.position.x - before.x, this.controller.runtime.pose.position.z - before.z);
    if (caught) {
      this.captures++;
      this.mark('captureConfirmed', { precedingFrame: { player: before, enemy: prior.actor.motion.position, phase: prior.actor.phase },
        frameDelta: dt, recoveredPose: this.controller.runtime.pose, recoveryPending: this.session.actor.recoveryPending });
    }
    // An approaching real foot plant is available to the current audio bus.
    // 4.5m is an explicitly authored test perception threshold, not a measured
    // hearing threshold. Earlier/farther ambient steps do not command retreat.
    if (this.working && this.firstDangerCue === undefined) {
      const cue = this.controller.pendingActorPlants.find(plant => Math.hypot(plant.position.x - before.x, plant.position.y - before.y, plant.position.z - before.z) <= 4.5);
      if (cue) {
        this.firstDangerCue = this.time;
        this.mark('firstDangerCue', { kind: 'real-footplant-in-range', source: cue.position, thresholdMeters: 4.5,
          blockedLine: segmentOccluded(before, cue.position, worldForController(this.controller), 'mirror-actor-body') });
      }
    }
    if (this.observingDeparture) for (const plant of this.controller.pendingActorPlants) {
      const range = Math.hypot(plant.position.x - before.x, plant.position.y - before.y, plant.position.z - before.z);
      if (range < 5.6) this.departingCue = undefined;
      else if (range < 10 && this.previousPlantRange !== undefined && range > this.previousPlantRange + .04)
        this.departingCue = { time: this.time, range, previousRange: this.previousPlantRange };
      this.previousPlantRange = range;
    }
    // Same ordering as an accepted host frame, without a native-device claim.
    flushControllerAudioFrame(this.controller);
    presentControllerRecovery(this.controller, dt);
    if (prior.gateLift < 1.82 && this.session.gateLift >= 1.82) this.mark('gatePassable');
    if (!prior.gateCrossed && this.session.gateCrossed) this.mark('gateCrossed');
    this.assertSafe('frame');
  }
  wait(seconds: number) {
    const until = this.time + seconds;
    while (this.time < until - 1e-9) this.tick(until - this.time);
  }
  aim(target: Vec3) {
    const pose = this.controller.runtime.pose, dx = target.x - pose.position.x, dz = target.z - pose.position.z;
    const yaw = Math.atan2(-dx, -dz), angle = Math.atan2(Math.sin(yaw - pose.yaw), Math.cos(yaw - pose.yaw));
    commandController(this.controller, { type: 'turn', yaw: angle, pitch: Math.atan2(target.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch });
    syncCamera(this.controller, this.camera);
  }
  walk(x: number, z: number) {
    const start = this.time;
    let moved = false;
    for (let frame = 0; frame < 2400; frame++) {
      const before = this.controller.runtime.pose.position, distance = Math.hypot(x - before.x, z - before.z);
      if (distance < .015 || this.controller.runtime.progress.cleared) { this.controller.input.forward = 0; return; }
      this.aim({ x, y: before.y, z }); this.controller.input.forward = 1;
      this.tick(Math.min(.05, distance / MOVE_SPEED));
      if (!moved && !this.captures && Math.hypot(this.controller.runtime.pose.position.x - before.x, this.controller.runtime.pose.position.z - before.z) > 1e-6) { moved = true; this.mark('movementResumed'); }
      if (this.captures) throw new Error(`Capture during real walk: ${JSON.stringify(this.events.slice(-4))}`);
      if (this.time - start > 35) break;
    }
    this.mark('blocked', { target: { x, z } });
    throw new Error(`Blocked real mirror route: ${JSON.stringify(this.events.at(-1))}`);
  }
  press(id: 'mirror-corridor-figure' | 'mirror-corridor-key', target: Vec3) {
    this.aim(target);
    if (controllerSnapshot(this.controller).target?.id !== id || !interactController(this.controller, id)) throw new Error(`Refused visible action ${id}`);
  }
  hold(id: 'mirror-corridor-practice' | 'mirror-corridor-winch', target: Vec3) {
    this.aim(target); this.assertSafe('hold-start');
    if (!beginStageHoldController(this.controller, id, 41)) throw new Error(`Refused legal hold ${id} at ${JSON.stringify(this.controller.runtime.pose)}`);
    if (id === 'mirror-corridor-winch') { this.working = true; this.firstDangerCue = undefined; this.mark('workStart'); }
  }
  release(id: 'mirror-corridor-practice' | 'mirror-corridor-winch') {
    endStageHoldController(this.controller, id, 41);
    this.working = false; this.mark('release');
    if (this.session.holding) throw new Error('Released hold retained ownership');
  }
  prepareWork() {
    this.wait(this.options.initialWait);
    this.walk(0, -1.5); this.press('mirror-corridor-figure', FIGURE_CENTER); this.press('mirror-corridor-key', KEY_CENTER);
    this.walk(0, 5.9); this.walk(-2.16, 5.9); this.walk(-2.16, 6.9);
    this.hold('mirror-corridor-practice', PRACTICE_CENTER); this.wait(.6); this.release('mirror-corridor-practice');
    this.walk(-2.16, 5.9); this.walk(-1.1, 5.9); this.walk(-1.1, 9.6);
    this.walk(this.options.work[0], 9.6); this.walk(...this.options.work);
  }
  run() {
    this.prepareWork();
    this.hold('mirror-corridor-winch', WINCH_CENTER);
    if (this.options.retreat) {
      const limit = this.time + 9;
      while (this.time < limit && (this.firstDangerCue === undefined || this.time < this.firstDangerCue + this.options.reaction - 1e-9)) this.tick();
      if (this.firstDangerCue === undefined) throw new Error('No physical danger cue reached the work pose');
      this.release('mirror-corridor-winch');
      this.walk(this.options.work[0], 9.85); this.walk(SHELTER_SAFE.position.x, 9.85); this.walk(SHELTER_SAFE.position.x, SHELTER_SAFE.position.z);
      this.mark('coverReached');
      // Re-enter only after real emitted footsteps recede. This uses the same
      // source-distance attenuation as audio, not enemy phase or hidden memory.
      const coverTime = this.time;
      this.observingDeparture = true; this.previousPlantRange = undefined; this.departingCue = undefined;
      while (this.time - coverTime < 40 && (this.time - coverTime < 4 || !this.departingCue)) this.tick();
      this.observingDeparture = false;
      if (!this.departingCue) {
        this.mark('departureWaitExpired', { pathTarget: this.session.actor.pathTarget, pathWaypoint: this.session.actor.pathWaypoint,
          lastSeen: this.session.actor.lastSeen, lastHeard: this.session.actor.lastHeard });
        throw new Error(`No receding physical footsteps from cover: ${JSON.stringify(this.events.at(-1))}`);
      }
      this.mark('departureCue', this.departingCue);
      this.walk(SHELTER_SAFE.position.x, 9.85); this.walk(this.options.work[0], 9.85); this.walk(...this.options.work);
      if (this.session.ratchets < 3) this.hold('mirror-corridor-winch', WINCH_CENTER);
    }
    const deadline = this.time + 7;
    while (this.session.ratchets < 3 && this.time < deadline) this.tick();
    this.release('mirror-corridor-winch');
    if (this.session.ratchets !== 3 || this.captures) throw new Error(`Unfinished/caught mirror route: ${JSON.stringify(this.events.slice(-5))}`);
    this.walk(this.options.work[0], 9.3); this.walk(2.5, 9.3); this.walk(2.5, 15.9); this.walk(0, 15.9); this.walk(0, 31.7);
    this.mark('visibleExitReached');
    if (!this.controller.runtime.progress.cleared) throw new Error('Walking through the visible exit did not clear area04');
    return { options: this.options, simulatedSeconds: this.time, captures: this.captures,
      distanceWalked: this.distanceWalked, checkpoint: createCheckpoint(this.controller.runtime), events: this.events };
  }
}
