import * as THREE from 'three';
import { createCheckpoint, MOVE_SPEED, projectWithCamera, type Vec3 } from '../src/domain/firstPerson';
import { createContourSpec, createShadowSpec, GALLERY_CONTOUR_FIXTURE, GALLERY_EXIT_PANEL_FIXTURE,
  GALLERY_LIGHT_FIXTURE, GALLERY_SHADOW_FIXTURE, GALLERY_WIRING_FIXTURE, normalizeAngle } from '../src/domain/gallery';
import { VAULT_EXIT_FIXTURE, VAULT_PARTITION_FIXTURE, vaultFixture } from '../src/domain/vault/definition';
import { LENGTH_SPEC, ROD_SPEC } from '../src/domain/vault/specs';
import { THEATRE_CURTAIN_FIXTURE, THEATRE_LIGHT_FIXTURE } from '../src/domain/theatre/definition';
import { lightHandlePoint } from '../src/domain/theatre/lightGate';
import { actorFullyContained, doorSweepClear } from '../src/domain/stages/departure-control-v1/definition';
import { isStageSession as isControlSession } from '../src/domain/stages/departure-control-v1/session';
import { isStageSession as isMirrorSession } from '../src/domain/stages/mirror-corridor-v1/session';
import { advanceController, beginStageHoldController, commandController, controllerSnapshot,
  createController, endStageHoldController, interactController, syncCamera, type RuntimeController } from '../src/rendering/firstPerson/runtimeController';
import { galleryAction } from '../src/rendering/firstPerson/galleryController';
import { vaultAction, vaultPointer } from '../src/rendering/firstPerson/vaultController';
import { theatreAction, theatrePointer } from '../src/rendering/firstPerson/theatreController';
import { CHAPTER_ONE } from '../src/domain/campaign/definition';
import type { ChapterOneSession } from '../src/domain/campaign/session';

const WIDTH = 390, HEIGHT = 844;
export type Run = { controller: RuntimeController; camera: THREE.PerspectiveCamera };
export function attachNaturalRun(controller: RuntimeController): Run {
  const camera = new THREE.PerspectiveCamera(65, WIDTH / HEIGHT, .08, 60);
  controller.viewport = { width: WIDTH, height: HEIGHT };
  syncCamera(controller, camera);
  return { controller, camera };
}
export function openNaturalRun(session: ChapterOneSession, intensity: 'standard' | 'subdued'): Run {
  const controller = createController(session.checkpoint, false, true, CHAPTER_ONE.areas.find(area => area.id === session.currentArea)!.stageId);
  controller.horrorIntensity = intensity;
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false, renderReturns: 1, presentationReturns: 1 });
  return attachNaturalRun(controller);
}
function aim({ controller, camera }: Run, target: Vec3) {
  const pose = controller.runtime.pose, dx = target.x - pose.position.x, dz = target.z - pose.position.z;
  const desired = Math.atan2(-dx, -dz);
  commandController(controller, { type: 'turn', yaw: normalizeAngle(desired - pose.yaw),
    pitch: Math.atan2(target.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch });
  syncCamera(controller, camera);
}
function walk(run: Run, x: number, z: number) {
  const { controller, camera } = run;
  for (let frame = 0; frame < 2200; frame++) {
    const before = controller.runtime.pose.position, distance = Math.hypot(x - before.x, z - before.z);
    if (distance < .025 || controller.runtime.progress.cleared) { controller.input.forward = 0; return; }
    aim(run, { x, y: before.y, z }); controller.input.forward = 1;
    advanceController(controller, Math.min(1 / 60, distance / MOVE_SPEED), camera);
    const after = controller.runtime.pose.position;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThanOrEqual(MOVE_SPEED / 60 + .002);
  }
  throw new Error(`Blocked in ${controller.runtime.chapterId} at ${JSON.stringify(controller.runtime.pose.position)} toward ${x},${z}`);
}
function press(run: Run, id: Parameters<typeof interactController>[1], target: Vec3) {
  aim(run, target);
  expect(controllerSnapshot(run.controller).target?.id).toBe(id);
  expect(interactController(run.controller, id)).toBe(true);
}
function devicePoint(run: Run, center: Vec3, normal: Vec3, right: Vec3, x: number, y: number) {
  const up = { x: normal.y * right.z - normal.z * right.y,
    y: normal.z * right.x - normal.x * right.z, z: normal.x * right.y - normal.y * right.x };
  const projected = projectWithCamera({ x: center.x + right.x * x + up.x * y,
    y: center.y + right.y * x + up.y * y, z: center.z + right.z * x + up.z * y }, run.controller.matrices!);
  expect(projected).toBeDefined();
  return { x: (projected!.x + 1) * WIDTH / 2, y: (1 - projected!.y) * HEIGHT / 2 };
}
function solveGalleryWing(run: Run, kind: 'shadow' | 'contour') {
  const c = run.controller;
  press(run, kind === 'shadow' ? 'shadow-panel' : 'contour-panel',
    kind === 'shadow' ? GALLERY_SHADOW_FIXTURE.center : GALLERY_CONTOUR_FIXTURE.center);
  if (kind === 'shadow') {
    const state = c.runtime.progress.gallery!.shadow;
    const pair = createShadowSpec(state.seed, state.variant).samples.filter(sample => sample.color === '#808080');
    expect(galleryAction(c, { type: 'shadow-place', sampleId: pair[0]!.id, slotId: 'socket-left' })).toBe(true);
    expect(galleryAction(c, { type: 'shadow-place', sampleId: pair[1]!.id, slotId: 'socket-right' })).toBe(true);
    expect(galleryAction(c, { type: 'shadow-commit' })).toBe(true);
  } else {
    const spec = createContourSpec(c.runtime.progress.gallery!.contour.seed);
    for (const disc of spec.discs) expect(galleryAction(c, { type: 'contour-adjust', discId: disc.id,
      delta: normalizeAngle(disc.targetAngle - c.runtime.gallery!.contourAngles[disc.id]) })).toBe(true);
    expect(galleryAction(c, { type: 'contour-commit' })).toBe(true);
  }
  expect(galleryAction(c, { type: 'take-power', puzzle: kind })).toBe(true);
  expect(galleryAction(c, { type: 'leave' })).toBe(true);
}
function waitForGalleryPass(run: Run, beforeZ: number) {
  const c = run.controller;
  c.input.forward = 0;
  for (let frame = 0; frame < 2700; frame++) {
    const actor = c.runtime.gallery!.actor;
    if (actor.phase === 'patrol' && actor.position.z < beforeZ && Math.abs(actor.yaw) < .2) return;
    advanceController(c, 1 / 60, run.camera);
  }
  throw new Error(`Gallery patrol never passed z=${beforeZ}`);
}
function finishGallery(run: Run, order: readonly ['shadow' | 'contour', 'shadow' | 'contour']) {
  const c = run.controller;
  press(run, 'gallery-light', GALLERY_LIGHT_FIXTURE.center);
  press(run, 'gallery-exit-panel', GALLERY_EXIT_PANEL_FIXTURE.center);
  walk(run, 0, -10);
  for (const kind of order) {
    for (const [x, z] of kind === 'contour' ? [[9, -10], [9, -10.7]] : [[-3, -9.6], [-7, -9.6], [-7, -10.7]]) walk(run, x!, z!);
    solveGalleryWing(run, kind);
    for (const [x, z] of kind === 'contour' ? [[9, -10], [0, -10]] : [[-7, -9.6], [-3, -9.6], [0, -10]]) walk(run, x!, z!);
  }
  expect(c.runtime.progress.gallery!.order).toEqual(order.map(kind => kind === 'shadow' ? 'B' : 'C'));
  walk(run, 0, 2); press(run, 'gallery-exit-panel', GALLERY_EXIT_PANEL_FIXTURE.center);
  for (const [x, z] of [[0, 7], [-1.2, 7], [-1.2, 9.8]]) walk(run, x!, z!);
  press(run, 'wiring-panel', GALLERY_WIRING_FIXTURE.center);
  expect(galleryAction(c, { type: 'wiring-adjust', control: 'line', delta: -.24 })).toBe(true);
  expect(galleryAction(c, { type: 'wiring-commit' })).toBe(true);
  expect(galleryAction(c, { type: 'leave' })).toBe(true);
  for (const [x, z] of [[-1.2, 12.5], [1.7, 12.5], [1.7, 13.8]]) walk(run, x!, z!);
  if (c.horrorIntensity === 'standard') waitForGalleryPass(run, 13);
  for (const [x, z] of [[1.7, 15.2], [4, 15.2], [4, 17.5], [6.3, 17.5], [6.3, 18.8]]) walk(run, x!, z!);
  if (c.horrorIntensity === 'standard') waitForGalleryPass(run, 17);
  for (const [x, z] of [[6.3, 20.5], [4, 20.5], [4, 24]]) walk(run, x!, z!);
  aim(run, { x: 4, y: 1.4, z: 23.08 });
  expect(galleryAction(c, { type: 'close-exit' })).toBe(true);
  expect(c.runtime.progress.cleared).toBe(true);
}
function solveVault(run: Run, kind: 'length' | 'rod') {
  const c = run.controller, fixture = vaultFixture(kind);
  press(run, kind === 'length' ? 'vault-length' : 'vault-rod', fixture.center);
  const live = c.runtime.vault!;
  const start = kind === 'length'
    ? devicePoint(run, fixture.center, fixture.normal, fixture.right, LENGTH_SPEC.left + live.length, LENGTH_SPEC.sliderY)
    : devicePoint(run, fixture.center, fixture.normal, fixture.right, Math.sin(live.angle) * ROD_SPEC.length / 2, Math.cos(live.angle) * ROD_SPEC.length / 2);
  const end = kind === 'length'
    ? devicePoint(run, fixture.center, fixture.normal, fixture.right, LENGTH_SPEC.left + LENGTH_SPEC.targetLength, LENGTH_SPEC.sliderY)
    : devicePoint(run, fixture.center, fixture.normal, fixture.right, 0, ROD_SPEC.length / 2);
  expect(vaultPointer(c, 'start', 17, start, WIDTH, HEIGHT)).toBe(true);
  expect(vaultPointer(c, 'move', 17, end, WIDTH, HEIGHT)).toBe(true);
  expect(vaultPointer(c, 'end', 17, end, WIDTH, HEIGHT)).toBe(true);
  expect(vaultAction(c, { type: 'commit' })).toBe(true);
  expect(vaultAction(c, { type: 'leave' })).toBe(true);
}
function finishVault(run: Run) {
  solveVault(run, 'length');
  for (const [x, z] of [[.65, 2.9], [.65, 4.5], [0, 6.5], [-2.2, 7.2], [-2.2, 11.5],
    [-2.2, 15.5], [-3.1, 18.5], [-4.6, 18.5]]) walk(run, x!, z!);
  solveVault(run, 'rod');
  for (const [x, z] of [[-3.1, 18.5], [0, 18.5], [3, 18.5], [3, 21], [3, 24.3]]) walk(run, x!, z!);
  press(run, 'vault-partition', VAULT_PARTITION_FIXTURE.center);
  walk(run, 3, 29);
  press(run, 'vault-exit', VAULT_EXIT_FIXTURE.center);
  expect(run.controller.runtime.progress.cleared).toBe(true);
}
function finishTheatre(run: Run) {
  const c = run.controller, fixture = THEATRE_LIGHT_FIXTURE;
  press(run, 'theatre-light', fixture.center);
  const start = devicePoint(run, fixture.center, fixture.normal, fixture.right, 0, 0);
  const end = devicePoint(run, fixture.center, fixture.normal, fixture.right, lightHandlePoint(.8).x, 0);
  expect(theatrePointer(c, 'start', 18, start, WIDTH, HEIGHT)).toBe(true);
  expect(theatrePointer(c, 'move', 18, end, WIDTH, HEIGHT)).toBe(true);
  expect(theatrePointer(c, 'end', 18, end, WIDTH, HEIGHT)).toBe(true);
  expect(theatreAction(c, { type: 'commit-light' })).toBe(true);
  expect(theatreAction(c, { type: 'leave' })).toBe(true);
  for (const [x, z] of [[2, -2], [2, 3], [2, 4.6], [2.9, 5.5], [2.9, 7.6],
    [2.55, 13.8], [2.55, 16.7], [0, 17.4], [0, 19.6], [0, 21.3]]) walk(run, x!, z!);
  press(run, 'theatre-curtain', THEATRE_CURTAIN_FIXTURE.center);
  for (let frame = 0; frame < 70; frame++) advanceController(c, 1 / 60, run.camera);
  walk(run, 0, 23.6);
  expect(c.runtime.progress.cleared).toBe(true);
}
function finishMirror(run: Run) {
  const c = run.controller;
  const state = () => { const value = c.runtime.stageSession?.value;
    if (!isMirrorSession(value)) throw new Error('Mirror state missing'); return value; };
  const turn = (yaw: number, pitch = 0) => {
    commandController(c, { type: 'turn', yaw: yaw - c.runtime.pose.yaw, pitch: pitch - c.runtime.pose.pitch });
    syncCamera(c, run.camera);
  };
  const walkZ = (z: number) => { turn(Math.PI); walk(run, c.runtime.pose.position.x, z); };
  const walkX = (x: number) => { turn(Math.PI / 2); walk(run, x, c.runtime.pose.position.z); };
  walkZ(-1);
  turn(Math.PI, .1); expect(interactController(c, 'mirror-corridor-figure')).toBe(true);
  turn(Math.PI, -.16); expect(interactController(c, 'mirror-corridor-key')).toBe(true);
  walkZ(7.5); walkX(-1.5);
  turn(Math.PI / 2, -.16);
  expect(beginStageHoldController(c, 'mirror-corridor-practice', 3)).toBe(true);
  for (let i = 0; i < 40; i++) advanceController(c, 1 / 60, run.camera);
  expect(state().practiced).toBe(true);
  expect(endStageHoldController(c, 'mirror-corridor-practice', 3)).toBe(true);
  walkZ(10.9);
  const aimWinch = () => { const p = c.runtime.pose.position;
    turn(Math.atan2(-(-2.45 - p.x), -(11.3 - p.z)), -.16); };
  aimWinch(); expect(beginStageHoldController(c, 'mirror-corridor-winch', 4)).toBe(true);
  for (let i = 0; i < 120; i++) advanceController(c, 1 / 60, run.camera);
  expect(state().ratchets).toBe(1); expect(endStageHoldController(c, 'mirror-corridor-winch', 4)).toBe(true);
  if (c.horrorIntensity === 'subdued') {
    walkZ(8.5);
    for (let i = 0; i < 30; i++) advanceController(c, 1 / 60, run.camera);
    walkZ(10.9); aimWinch();
  }
  expect(beginStageHoldController(c, 'mirror-corridor-winch', 5)).toBe(true);
  for (let i = 0; i < 240; i++) advanceController(c, 1 / 60, run.camera);
  expect(state().ratchets).toBe(3); expect(endStageHoldController(c, 'mirror-corridor-winch', 5)).toBe(true);
  walkZ(8.5); walkX(0); walkZ(22);
  turn(Math.PI, -.06); expect(interactController(c, 'mirror-corridor-exit')).toBe(true);
  expect(c.runtime.progress.cleared).toBe(true);
}
function finishControl(run: Run, onStopped: () => void) {
  const c = run.controller;
  const state = () => { const value = c.runtime.stageSession?.value;
    if (!isControlSession(value)) throw new Error('Control state missing'); return value; };
  const turn = (yaw: number, pitch = 0) => {
    commandController(c, { type: 'turn', yaw: yaw - c.runtime.pose.yaw, pitch: pitch - c.runtime.pose.pitch });
    syncCamera(c, run.camera);
  };
  const walkZ = (z: number) => { turn(Math.PI); walk(run, c.runtime.pose.position.x, z); };
  const pressPanel = (id: Parameters<typeof interactController>[1], yaw = Math.PI / 2, pitch = -.16) => {
    turn(yaw, pitch); expect(controllerSnapshot(c).target?.id).toBe(id); expect(interactController(c, id)).toBe(true); };
  walkZ(9); pressPanel('departure-key');
  walkZ(10); pressPanel('departure-procedure');
  walkZ(11); pressPanel('departure-bell');
  let frames = 0;
  while (!(actorFullyContained(state().actor.motion.position) && doorSweepClear(state().actor.motion.position)) && frames < 780) {
    advanceController(c, 1 / 60, run.camera); frames++;
  }
  expect(frames).toBeLessThan(780);
  walkZ(12); pressPanel('departure-door');
  for (let i = 0; i < 90; i++) advanceController(c, 1 / 60, run.camera);
  expect(state().isolated).toBe(true);
  walkZ(13); pressPanel('departure-stop');
  expect(state().stopped).toBe(true);
  onStopped();
  pressPanel('departure-staff-door', Math.PI, -.07);
  walkZ(22.45); pressPanel('departure-outdoor', Math.PI, -.07);
  expect(c.runtime.progress.cleared).toBe(true);
}

/** Drive the actual mounted controller, never injecting a solved flag or pose. */
export function playNaturalArea(run: Run, index: number,
  order: readonly ['shadow' | 'contour', 'shadow' | 'contour'], onStopped: () => void = () => {}) {
  const finish = [finishVault, finishTheatre, finishMirror];
  expect(run.controller.runtime.chapterId).toBe(CHAPTER_ONE.areas[index]!.stageId);
  if (index === 0) finishGallery(run, order);
  else if (index < 4) finish[index - 1]!(run);
  else finishControl(run, onStopped);
  return createCheckpoint(run.controller.runtime);
}
