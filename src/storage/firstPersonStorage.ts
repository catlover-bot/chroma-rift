import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CHAPTER_ID, LEVEL_VERSION, createCheckpoint, createInitialRuntime, restoreCheckpoint,
  type CheckpointState,
} from '../domain/firstPerson';
import { DEFAULT_FIRST_PERSON_CONTROLS, type FirstPersonControls } from '../types/application';
import { resetApplicationStorage } from './applicationStorage';

export const FIRST_PERSON_CHECKPOINT_KEY = 'chroma-rift.first-person.chapter.v1';
export const FIRST_PERSON_CONTROLS_KEY = 'chroma-rift.first-person.controls.v1';

export type FirstPersonLoadResult = {
  controls: FirstPersonControls;
  checkpoint: CheckpointState;
  status: 'empty' | 'loaded' | 'recovered' | 'blocked';
  controlsWritable: boolean;
  checkpointWritable: boolean;
  message?: string;
};

type ControlsDocument = { schemaVersion: 1; controls: FirstPersonControls };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isFirstPersonControls(value: unknown): value is FirstPersonControls {
  return isRecord(value) && typeof value.sensitivity === 'number' && Number.isFinite(value.sensitivity) &&
    value.sensitivity >= 0.5 && value.sensitivity <= 2 &&
    (value.movementMode === 'standard' || value.movementMode === 'simple') &&
    (value.handedness === 'left' || value.handedness === 'right') &&
    (value.quality === 'low' || value.quality === 'standard');
}

function initialCheckpoint(): CheckpointState {
  return createCheckpoint(createInitialRuntime());
}

export function decodeFirstPersonStorage(checkpointRaw: string | null, controlsRaw: string | null): FirstPersonLoadResult {
  const result: FirstPersonLoadResult = {
    controls: { ...DEFAULT_FIRST_PERSON_CONTROLS }, checkpoint: initialCheckpoint(),
    status: checkpointRaw === null && controlsRaw === null ? 'empty' : 'loaded',
    controlsWritable: true, checkpointWritable: true,
  };
  if (controlsRaw !== null) {
    try {
      const value: unknown = JSON.parse(controlsRaw);
      if (!isRecord(value) || value.schemaVersion !== 1 || !isFirstPersonControls(value.controls)) throw new Error('unsupported controls');
      result.controls = value.controls;
    } catch {
      result.controlsWritable = false;
    }
  }
  if (checkpointRaw !== null) {
    try {
      const restored = restoreCheckpoint(JSON.parse(checkpointRaw));
      if (!restored) throw new Error('unsupported checkpoint');
      result.checkpoint = restored.checkpoint;
      if (restored.recovered) result.status = 'recovered';
    } catch {
      result.checkpointWritable = false;
    }
  }
  if (!result.controlsWritable || !result.checkpointWritable) {
    result.status = 'blocked';
    result.message = !result.checkpointWritable
      ? '章の記録を読み込めませんでした。元の記録を保持し、安全な地点から始めます。この章の進行は保存されません。'
      : '操作設定を読み込めませんでした。元の設定を保持し、今回は標準設定を使います。操作設定の変更は保存されません。';
  } else if (result.status === 'recovered') {
    result.message = '保存位置を安全なチェックポイントへ戻しました。';
  }
  return result;
}

let progressEpoch = 0;
let controlsEpoch = 0;
let progressWritable = true;
let controlsWritable = true;
let latestCheckpoint: CheckpointState | undefined;
let mutations: Promise<unknown> = Promise.resolve();

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutations.then(operation, operation);
  mutations = result.catch(() => undefined);
  return result;
}

/** Capture this lease in each mounted run's callbacks, never read a newer lease from an old callback. */
export function beginFirstPersonSession(): number {
  progressEpoch += 1;
  return progressEpoch;
}

export function isFirstPersonSessionCurrent(lease: number): boolean {
  return lease === progressEpoch;
}

export async function loadFirstPersonStorage(): Promise<FirstPersonLoadResult> {
  await mutations;
  const readProgressEpoch = progressEpoch;
  const readControlsEpoch = controlsEpoch;
  const [checkpointRead, controlsRead] = await Promise.allSettled([
    AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY), AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY),
  ]);
  const result = decodeFirstPersonStorage(
    checkpointRead.status === 'fulfilled' ? checkpointRead.value : null,
    controlsRead.status === 'fulfilled' ? controlsRead.value : null,
  );
  if (checkpointRead.status === 'rejected') result.checkpointWritable = false;
  if (controlsRead.status === 'rejected') result.controlsWritable = false;
  if (!result.checkpointWritable || !result.controlsWritable) {
    result.status = 'blocked';
    result.message ??= '一人称の保存領域を読み込めませんでした。読み込めなかったデータへの保存を停止しています。';
  }
  if (readProgressEpoch === progressEpoch) {
    progressWritable = result.checkpointWritable;
    latestCheckpoint = result.checkpoint;
  } else {
    result.checkpoint = initialCheckpoint();
    result.checkpointWritable = false;
    result.status = 'blocked';
    result.message = '読み込み中に章の状態が切り替わりました。';
  }
  if (readControlsEpoch === controlsEpoch) controlsWritable = result.controlsWritable;
  else {
    result.controls = { ...DEFAULT_FIRST_PERSON_CONTROLS };
    result.controlsWritable = false;
    result.status = 'blocked';
    result.message = '読み込み中に保存データがリセットされました。';
  }
  return result;
}

function doesNotRewind(previous: CheckpointState | undefined, next: CheckpointState): boolean {
  if (!previous) return true;
  const old = previous.progress;
  const fresh = next.progress;
  return (!old.guideExamined || fresh.guideExamined) && (!old.markActivated || fresh.markActivated) &&
    (!old.sealA || fresh.sealA) && (!old.sealB || fresh.sealB) && (!old.exitDoorOpen || fresh.exitDoorOpen) && (!old.cleared || fresh.cleared) &&
    (old.variant !== 'exit' || fresh.variant === 'exit') && (!old.usedLookAssist || fresh.usedLookAssist);
}

/** Called only on semantic/checkpoint/pause events. No frame loop subscribes to storage. */
export function saveFirstPersonCheckpoint(checkpoint: CheckpointState, lease: number): Promise<boolean> {
  // Snapshot now: mutable runtime refs must not change the queued record later.
  const raw = JSON.stringify(checkpoint);
  return serializeMutation(async () => {
    if (!progressWritable || !isFirstPersonSessionCurrent(lease)) return false;
    const restored = restoreCheckpoint(JSON.parse(raw));
    if (!restored || restored.recovered || restored.checkpoint.chapterId !== CHAPTER_ID ||
      restored.checkpoint.levelVersion !== LEVEL_VERSION || !doesNotRewind(latestCheckpoint, restored.checkpoint)) return false;
    try {
      await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
      if (!isFirstPersonSessionCurrent(lease)) return false;
      latestCheckpoint = restored.checkpoint;
      return true;
    } catch {
      return false;
    }
  });
}

export function saveFirstPersonControls(controls: FirstPersonControls): Promise<boolean> {
  const epoch = controlsEpoch;
  const document: ControlsDocument = { schemaVersion: 1, controls };
  const raw = JSON.stringify(document);
  return serializeMutation(async () => {
    if (!controlsWritable || epoch !== controlsEpoch || !isFirstPersonControls(JSON.parse(raw).controls)) return false;
    try {
      await AsyncStorage.setItem(FIRST_PERSON_CONTROLS_KEY, raw);
      return epoch === controlsEpoch;
    } catch {
      return false;
    }
  });
}

export function resetFirstPersonChapter(): Promise<boolean> {
  progressEpoch += 1;
  progressWritable = false;
  return serializeMutation(async () => {
    try {
      await AsyncStorage.removeItem(FIRST_PERSON_CHECKPOINT_KEY);
      latestCheckpoint = undefined;
      progressWritable = true;
      return true;
    } catch {
      return false;
    }
  });
}

/** Explicit full reset. Both old and new namespaces invalidate pending writes immediately. */
export async function resetAllApplicationStorage(): Promise<boolean> {
  progressEpoch += 1;
  controlsEpoch += 1;
  progressWritable = false;
  controlsWritable = false;
  const applicationReset = resetApplicationStorage();
  const firstPersonReset = serializeMutation(async () => {
    try {
      await AsyncStorage.multiRemove([FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY]);
      return true;
    } catch {
      return false;
    }
  });
  const [applicationRemoved, chapterRemoved] = await Promise.all([applicationReset, firstPersonReset]);
  const succeeded = applicationRemoved && chapterRemoved;
  latestCheckpoint = undefined;
  progressWritable = succeeded;
  controlsWritable = succeeded;
  return succeeded;
}
