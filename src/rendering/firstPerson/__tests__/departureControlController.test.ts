import * as THREE from 'three';
import { createCheckpoint } from '../../../domain/firstPerson';
import { actorFullyContained, doorSweepClear } from '../../../domain/stages/departure-control-v1/definition';
import { carriedKeyEntry, isStageSession } from '../../../domain/stages/departure-control-v1/session';
import { stageModule } from '../../../domain/stageKit/modules';
import { CHAPTER_ONE } from '../../../domain/campaign/definition';
import { parseChapterOneSession } from '../../../domain/campaign/checkpoint';
import { completeCampaignArea, createChapterOneSession, recordCampaignCheckpoint, type ChapterOneSession } from '../../../domain/campaign/session';
import { STAGE_SCENE_BINDINGS } from '../stageSceneBindings';
import { advanceController, commandController, controllerSnapshot, createController, interactController, syncCamera, worldForController } from '../runtimeController';

const camera = () => new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
function state(controller: ReturnType<typeof createController>) {
  const value = controller.runtime.stageSession?.value;
  if (!isStageSession(value)) throw new Error('Control-room state missing');
  return value;
}

test('registered final-area controller follows a real bell, latch, stop and outdoor sequence', () => {
  const module = stageModule('departure-control-v1')!;
  const fresh = module.checkpoint(module.create());
  const carried = module.restore({ ...fresh, stageData: carriedKeyEntry() })?.checkpoint;
  expect(carried).toBeDefined();
  if (!carried) throw new Error('Carried-key entry missing');
  // This isolates the final area contract with a valid prefix. It is not an
  // 01→04 route proof; the controller below supplies the final area's actions.
  let campaign: ChapterOneSession = { ...createChapterOneSession('final-area-contract', '0.1.0'),
    currentArea: 'chapter-1-area-05' as const,
    completedAreas: CHAPTER_ONE.areas.slice(0, 4).map(area => area.id),
    checkpoint: carried, keyLocation: 'carried' };
  expect(parseChapterOneSession(campaign)).toBeDefined();
  const controller = createController(carried, false, true, 'departure-control-v1'), view = camera();
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false });
  expect(STAGE_SCENE_BINDINGS['departure-control-v1']).toBeDefined();
  expect(worldForController(controller).chapterId).toBe('departure-control-v1');
  const facePanel = (z: number) => {
    controller.runtime.pose = { position: { x: -3.75, y: 1.6, z }, yaw: Math.PI / 2, pitch: -.16 };
    syncCamera(controller, view);
  };
  facePanel(9);
  expect(controllerSnapshot(controller).target?.id).toBe('departure-key');
  expect(interactController(controller, 'departure-key')).toBe(true);
  expect(state(controller).keyInstalled).toBe(true);
  facePanel(10);
  expect(interactController(controller, 'departure-procedure')).toBe(true);
  expect(controller.feedbackMessage).toContain('全身が入ってから');
  facePanel(11);
  expect(interactController(controller, 'departure-bell')).toBe(true);
  expect(state(controller).noise?.position).toMatchObject({ x: 2.45, z: 18.1 });
  commandController(controller, { type: 'step', forward: 0 });
  expect(state(controller).noise?.position).toMatchObject({ x: 2.45, z: 18.1 });
  let contained = false;
  for (let frame = 0; frame < 780 && !contained; frame += 1) {
    advanceController(controller, 1 / 60, view);
    contained = actorFullyContained(state(controller).actor.motion.position) && doorSweepClear(state(controller).actor.motion.position);
  }
  expect(contained).toBe(true);
  facePanel(12);
  expect(interactController(controller, 'departure-door')).toBe(true);
  for (let frame = 0; frame < 90; frame += 1) advanceController(controller, 1 / 60, view);
  expect(state(controller).isolated).toBe(true);
  expect(worldForController(controller).solids.find(s => s.id === 'containment-door')?.min.y).toBe(0);
  facePanel(13);
  expect(interactController(controller, 'departure-stop')).toBe(true);
  expect(state(controller).actor.phase).toBe('stopped');
  expect(controller.runtime.progress.cleared).toBe(false);
  const stoppedCheckpoint = createCheckpoint(controller.runtime);
  expect(completeCampaignArea(campaign, campaign.currentArea, stoppedCheckpoint))
    .toMatchObject({ accepted: false, reason: 'not-cleared' });
  const recorded = recordCampaignCheckpoint(campaign, campaign.currentArea, stoppedCheckpoint);
  expect(recorded.accepted).toBe(true);
  if (!recorded.accepted) throw new Error('Stop state was not recorded');
  campaign = recorded.session;
  expect(campaign.keyLocation).toBe('installed');
  expect(campaign.finale).toMatchObject({ contained: true, isolated: true, stopped: true, outdoorExited: false });
  expect(parseChapterOneSession(campaign)).toBeDefined();
  controller.runtime.pose = { position: { x: -3.7, y: 1.6, z: 12.25 }, yaw: Math.PI, pitch: -.07 };
  syncCamera(controller, view);
  expect(controllerSnapshot(controller).target?.id).toBe('departure-staff-door');
  expect(interactController(controller, 'departure-staff-door')).toBe(true);
  controller.input.forward = 1;
  for (let frame = 0; frame < 430 && controller.runtime.pose.position.z < 22.5; frame += 1)
    advanceController(controller, 1 / 60, view);
  controller.input.forward = 0;
  expect(controller.runtime.pose.position.z).toBeGreaterThan(22.35);
  syncCamera(controller, view);
  expect(interactController(controller, 'departure-outdoor')).toBe(true);
  expect(controller.runtime.progress.cleared).toBe(true);
  const outdoorCheckpoint = createCheckpoint(controller.runtime);
  expect(outdoorCheckpoint.stageData).toMatchObject({ stopped: true, staffDoorOpened: true, cleared: true });
  const completed = completeCampaignArea(campaign, campaign.currentArea, outdoorCheckpoint);
  expect(completed).toMatchObject({ accepted: true, kind: 'campaign-completed', session: {
    campaignCompleted: true, completedAreas: CHAPTER_ONE.areas.map(area => area.id),
    finale: { contained: true, isolated: true, stopped: true, outdoorExited: true } } });
  if (!completed.accepted) throw new Error('Outdoor completion missing');
  expect(parseChapterOneSession(completed.session)).toBeDefined();
});

test('final-area equipment remains reachable after an early closure refusal and manual reopening', () => {
  const module = stageModule('departure-control-v1')!;
  const fresh = module.checkpoint(module.create());
  const carried = module.restore({ ...fresh, stageData: carriedKeyEntry() })?.checkpoint;
  if (!carried) throw new Error('Carried-key entry missing');
  const controller = createController(carried, false, true, 'departure-control-v1');
  const view = camera();
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false });
  const turn = (yaw: number, pitch = 0) => {
    commandController(controller, { type: 'turn', yaw: yaw - controller.runtime.pose.yaw,
      pitch: pitch - controller.runtime.pose.pitch });
    syncCamera(controller, view);
  };
  const walkTo = (z: number) => {
    turn(Math.PI);
    let frames = 0;
    while (Math.abs(controller.runtime.pose.position.z - z) > .07 && frames < 500) {
      controller.input.forward = controller.runtime.pose.position.z < z ? 1 : -1;
      advanceController(controller, 1 / 60, view);
      frames += 1;
    }
    controller.input.forward = 0;
    expect(frames).toBeLessThan(500);
    expect(Math.abs(controller.runtime.pose.position.z - z)).toBeLessThan(.08);
  };
  const press = (id: Parameters<typeof interactController>[1], yaw = Math.PI / 2, pitch = -.16) => {
    turn(yaw, pitch);
    expect(controllerSnapshot(controller).target?.id).toBe(id);
    expect(interactController(controller, id)).toBe(true);
  };

  walkTo(9); press('departure-key');
  walkTo(10); press('departure-procedure');
  walkTo(12); turn(Math.PI / 2, -.16);
  expect(controllerSnapshot(controller).target?.id).toBe('departure-door');
  expect(interactController(controller, 'departure-door')).toBe(false);
  expect(state(controller)).toMatchObject({ doorProgress: 0, isolated: false, stopped: false });
  walkTo(11); press('departure-bell');
  let frames = 0;
  while (!(actorFullyContained(state(controller).actor.motion.position) &&
    doorSweepClear(state(controller).actor.motion.position)) && frames < 780) {
    advanceController(controller, 1 / 60, view);
    frames += 1;
  }
  expect(frames).toBeLessThan(780);
  walkTo(12); press('departure-door');
  advanceController(controller, 1 / 60, view);
  expect(state(controller).doorProgress).toBeGreaterThan(0);
  press('departure-reopen');
  expect(state(controller)).toMatchObject({ doorMode: 'opening', isolated: false, stopped: false });
  for (let frame = 0; frame < 90 && state(controller).doorProgress > 0; frame += 1)
    advanceController(controller, 1 / 60, view);
  expect(state(controller)).toMatchObject({ doorMode: 'idle', doorProgress: 0, isolated: false, stopped: false });
  expect(module.restore(createCheckpoint(controller.runtime))?.checkpoint.stageData).toMatchObject({
    keyInstalled: true, procedureRead: true, isolated: false, stopped: false,
  });
  walkTo(11);
  for (let frame = 0; frame < 390 && state(controller).bellCooldown > 0; frame += 1)
    advanceController(controller, 1 / 60, view);
  expect(state(controller).bellCooldown).toBe(0);
  press('departure-bell');
  frames = 0;
  while (!(actorFullyContained(state(controller).actor.motion.position) &&
    doorSweepClear(state(controller).actor.motion.position)) && frames < 780) {
    advanceController(controller, 1 / 60, view);
    frames += 1;
  }
  expect(frames).toBeLessThan(780);
  walkTo(12); press('departure-door');
  for (let frame = 0; frame < 90; frame += 1) advanceController(controller, 1 / 60, view);
  expect(state(controller).isolated).toBe(true);
  walkTo(13); press('departure-stop');
  press('departure-staff-door', Math.PI, -.07);
  walkTo(22.45); press('departure-outdoor', Math.PI, -.07);
  expect(controller.runtime.progress.cleared).toBe(true);
  expect(state(controller)).toMatchObject({ stopped: true, cleared: true });
});
