import { createBaseRuntime, initialProgress } from '../../firstPerson/baseRuntime';
import type { ChapterRuntime, CheckpointState, InteractableId } from '../../firstPerson/types';
import type { StageModule } from '../../stageKit/modules';
import { DEPARTURE_COPY } from './copy';
import { advanceContainmentActor } from './actor';
import { parseStageCheckpoint } from './checkpoint';
import { CONTROL_SAFE, STAGE_ID, stageWorld, type TargetId } from './definition';
import { selectDepartureAction, selectDeparturePresentation } from './selectors';
import { advanceStage, checkpointStage, commandStage, createStageSession, isStageSession,
  type StageCommand, type StageSession } from './session';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function session(runtime: ChapterRuntime): StageSession | undefined {
  const entry = runtime.stageSession;
  return entry?.stageId === STAGE_ID && isStageSession(entry.value) ? entry.value : undefined;
}
function create(checkpoint?: CheckpointState, number?: number): ChapterRuntime {
  if (checkpoint && checkpoint.chapterId !== STAGE_ID) throw new RangeError('Foreign control-room checkpoint');
  const base = createBaseRuntime(STAGE_ID, CONTROL_SAFE, initialProgress(), number);
  const current = createStageSession(String(base.session), checkpoint?.stageData);
  return { ...base, pose: { ...current.pose, position: { ...current.pose.position } },
    progress: { ...base.progress, cleared: current.cleared }, stageSession: { stageId: STAGE_ID, value: current } };
}
function message(command: StageCommand, reason: ReturnType<typeof commandStage>['reason'], accepted: boolean): string {
  if (!accepted) return reason === 'tooFar' ? '近づいてから操作する。' : reason === 'coolingDown' ? '呼び鈴の回路が戻るのを待つ。' :
    reason === 'actorOutside' ? '巡回体の全身が収容区画に入るのを待つ。' :
    reason === 'sweepOccupied' ? '扉の可動範囲を空ける。' :
    reason === 'unsafeSide' ? '制御盤のある安全な側へ戻る。' :
    command.type === 'stop-control' ? DEPARTURE_COPY.isolationFirst : '手順と隔離キーを確認する。';
  switch (command.type) {
    case 'install-key': return '隔離キーを制御盤に差した。鍵はここに残る。';
    case 'read-procedure': return DEPARTURE_COPY.containmentInstruction;
    case 'ring-bell': return '収容区画の受鈴器が鳴った。';
    case 'close-door': return '隔離扉を閉じる。全身が区画内にいる。';
    case 'reopen-door': return '隔離扉を開け直す。';
    case 'stop-control': return `巡回体が止まった。${DEPARTURE_COPY.attendance01}。職員出口へ進む。`;
    case 'open-staff-door': return '職員出口が開いた。屋外へ進む。';
    case 'outdoor-exit': return `${DEPARTURE_COPY.attendance00}。${DEPARTURE_COPY.recordComplete}。`;
  }
}
function command(runtime: ChapterRuntime, packet: StageCommand,
  context: { rendererReady: boolean; foreground: boolean; targetId: string | null }) {
  const live = session(runtime);
  if (!live || runtime.paused || !context.rendererReady || !context.foreground || context.targetId !== packet.targetId)
    return { runtime, accepted: false, stopInput: false, message: '' };
  const result = commandStage({ ...live, pose: runtime.pose }, packet);
  const action = selectDepartureAction({ ...live, pose: runtime.pose }, packet.targetId);
  return { runtime: { ...runtime, progress: { ...runtime.progress, cleared: result.session.cleared },
    pose: result.session.pose, stageSession: { stageId: STAGE_ID, value: result.session } },
    accepted: result.accepted, stopInput: false, message: action.state !== 'ready' && result.reason !== 'tooFar'
      ? action.message : message(packet, result.reason, result.accepted) };
}

export const stageBinding: StageModule<StageCommand, ReturnType<typeof command>> = {
  id: STAGE_ID, create,
  advance: (runtime, dt) => {
    const live = session(runtime);
    if (!live) return runtime;
    const next = advanceStage({ ...live, pose: runtime.pose }, dt);
    return { ...runtime, progress: { ...runtime.progress, cleared: next.cleared }, stageSession: { stageId: STAGE_ID, value: next } };
  },
  world: runtime => {
    const live = session(runtime);
    return stageWorld(live?.doorProgress ?? 0, live?.staffDoorOpened ?? false, live?.actor.motion.position,
      live?.keyInstalled ?? false, live?.stopped ?? false, live?.staffDoorProgress);
  },
  present: runtime => {
    const live = session(runtime);
    return live ? selectDeparturePresentation(live) : { objective: '退館制御室を確かめる。', hint: { text: '' } };
  },
  targetPresentation: (runtime, targetId) => {
    const live = session(runtime); if (!live) return;
    const target = stageWorld(live.doorProgress, live.staffDoorOpened, undefined, live.keyInstalled, live.stopped)
      .interactables.find(item => item.id === targetId);
    return target ? selectDepartureAction({ ...live, pose: runtime.pose }, target.id) : undefined;
  },
  completionTail: runtime => session(runtime)?.exitAftermathSeconds ?? 0,
  completionTailMovement: true,
  command,
  interactResult: (runtime, targetId: InteractableId) => {
    const live = session(runtime);
    if (!live) return { runtime, message: '' };
    const target = stageWorld(live.doorProgress, live.staffDoorOpened, undefined, live.keyInstalled, live.stopped)
      .interactables.find(item => item.id === targetId);
    if (!target) return { runtime, message: '' };
    const types: Record<TargetId, StageCommand['type']> = {
      'departure-key': 'install-key', 'departure-procedure': 'read-procedure',
      'departure-bell': 'ring-bell', 'departure-door': 'close-door', 'departure-reopen': 'reopen-door',
      'departure-stop': 'stop-control', 'departure-staff-door': 'open-staff-door', 'departure-outdoor': 'outdoor-exit',
    };
    const packet: StageCommand = { sessionId: live.sessionId, seq: live.lastSeq + 1, targetId: target.id as TargetId,
      type: types[target.id as TargetId] };
    const result = command(runtime, packet, { rendererReady: true, foreground: true, targetId: target.id });
    return { runtime: result.accepted ? result.runtime : runtime, message: result.message };
  },
  actor: { usesGalleryBody: true, advance: (runtime, dt, context) => {
    const live = session(runtime);
    if (!live) return { runtime, caught: false, movedDistance: 0, footPlants: [], events: [], soundSources: [] };
    const result = advanceContainmentActor({ ...live, pose: { ...runtime.pose, position: { ...runtime.pose.position } } }, dt, context);
    return { runtime: { ...runtime, pose: result.session.pose, stageSession: { stageId: STAGE_ID, value: result.session } },
      caught: result.caught, movedDistance: result.movedDistance,
      footPlants: result.footPlants, events: result.events, soundSources: result.soundSources };
  } },
  cancel: runtime => {
    const live = session(runtime);
    return live?.noise ? { ...runtime, stageSession: { stageId: STAGE_ID, value: { ...live, noise: undefined } } } : runtime;
  },
  checkpoint: runtime => {
    const live = session(runtime);
    if (!live) throw new RangeError('Missing control-room session');
    const data = checkpointStage({ ...live, pose: runtime.pose });
    return { schemaVersion: 1, chapterId: STAGE_ID, levelVersion: 1,
      pose: { ...data.pose, position: { ...data.pose.position } },
      progress: { ...initialProgress(), cleared: data.cleared }, stageData: data };
  },
  restore: value => {
    if (!record(value) || value.schemaVersion !== 1 || value.chapterId !== STAGE_ID || value.levelVersion !== 1) return;
    const data = parseStageCheckpoint(value.stageData);
    if (!data) return;
    return { checkpoint: { schemaVersion: 1, chapterId: STAGE_ID, levelVersion: 1,
      pose: { ...data.pose, position: { ...data.pose.position } },
      progress: { ...initialProgress(), cleared: data.cleared }, stageData: data }, recovered: false };
  },
  canReplaceCheckpoint: (previous, next) => {
    const old = parseStageCheckpoint(previous.stageData), fresh = parseStageCheckpoint(next.stageData);
    return !!old && !!fresh && (!old.keyInstalled || fresh.keyInstalled) &&
      (!old.procedureRead || fresh.procedureRead) && (!old.stopped || fresh.stopped) &&
      (!old.staffDoorOpened || fresh.staffDoorOpened) && (!old.cleared || fresh.cleared) &&
      (!old.isolated || fresh.isolated || !old.stopped);
  },
  renderKind: 'simple', inputPolicy: runtime => ({ move: true, look: true, pointer: 'none', dangerAdvances: !session(runtime)?.isolated && !session(runtime)?.stopped, end: 'release' }),
};
