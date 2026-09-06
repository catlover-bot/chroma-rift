import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CHAPTER_ID, LEVEL_VERSION, createCheckpoint, createInitialRuntime, restoreCheckpoint,
  type CheckpointState,
} from '../domain/firstPerson';
import {
  DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_FIRST_PERSON_ONBOARDING,
  type FirstPersonControls, type FirstPersonOnboarding,
} from '../types/application';
import { resetApplicationStorage } from './applicationStorage';

export const FIRST_PERSON_CHECKPOINT_KEY = 'chroma-rift.first-person.chapter.v1';
export const FIRST_PERSON_PRE_EMBLEM_KEY = 'chroma-rift.first-person.chapter.pre-emblem.v1';
export const FIRST_PERSON_CONTROLS_KEY = 'chroma-rift.first-person.controls.v1';
export const FIRST_PERSON_ONBOARDING_KEY = 'chroma-rift.first-person.onboarding.v1';

export type FirstPersonLoadResult = {
  controls: FirstPersonControls;
  onboarding: FirstPersonOnboarding;
  onboardingWritable: boolean;
  checkpoint: CheckpointState;
  emblemStatus: 'valid' | 'migrated' | 'invalid' | 'unsupported';
  status: 'empty' | 'loaded' | 'recovered' | 'blocked';
  controlsWritable: boolean;
  checkpointWritable: boolean;
  message?: string;
};

type ControlsDocument = { schemaVersion: 1; controls: FirstPersonControls };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasValidBaseControls(value: unknown): value is FirstPersonControls {
  return isRecord(value) && typeof value.sensitivity === 'number' && Number.isFinite(value.sensitivity) &&
    value.sensitivity >= 0.5 && value.sensitivity <= 2 &&
    (value.movementMode === 'standard' || value.movementMode === 'simple') &&
    (value.handedness === 'left' || value.handedness === 'right') &&
    (value.quality === 'low' || value.quality === 'standard');
}

const isSensitivity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 2;

export function isFirstPersonControls(value: unknown): value is FirstPersonControls {
  return hasValidBaseControls(value) && (value.verticalSensitivity === undefined || isSensitivity(value.verticalSensitivity));
}

/** New optional fields fall back without rejecting an otherwise valid v1 preference. */
function decodeControls(value: unknown): FirstPersonControls | undefined {
  if (!hasValidBaseControls(value)) return undefined;
  return { ...value, verticalSensitivity: isSensitivity(value.verticalSensitivity) ? value.verticalSensitivity : 1 };
}

function isFirstPersonOnboarding(value: unknown): value is FirstPersonOnboarding {
  return isRecord(value) && value.schemaVersion === 1 &&
    typeof value.controlChoiceAcknowledged === 'boolean' && typeof value.tutorialCompleted === 'boolean';
}

function initialCheckpoint(): CheckpointState {
  return createCheckpoint(createInitialRuntime());
}

export function decodeFirstPersonStorage(checkpointRaw: string | null, controlsRaw: string | null, onboardingRaw: string | null = null): FirstPersonLoadResult {
  const result: FirstPersonLoadResult = {
    controls: { ...DEFAULT_FIRST_PERSON_CONTROLS }, checkpoint: initialCheckpoint(), emblemStatus: 'valid',
    onboarding: { ...DEFAULT_FIRST_PERSON_ONBOARDING }, onboardingWritable: true,
    status: checkpointRaw === null && controlsRaw === null && onboardingRaw === null ? 'empty' : 'loaded',
    controlsWritable: true, checkpointWritable: true,
  };
  if (controlsRaw !== null) {
    try {
      const value: unknown = JSON.parse(controlsRaw);
      if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('unsupported controls');
      const controls = decodeControls(value.controls);
      if (!controls) throw new Error('unsupported controls');
      result.controls = controls;
    } catch {
      result.controlsWritable = false;
    }
  }
  if (onboardingRaw !== null) {
    try {
      const value: unknown = JSON.parse(onboardingRaw);
      if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('unsupported onboarding');
      result.onboarding = {
        schemaVersion: 1,
        controlChoiceAcknowledged: value.controlChoiceAcknowledged === true,
        tutorialCompleted: value.tutorialCompleted === true,
      };
    } catch {
      result.onboardingWritable = false;
    }
  }
  if (checkpointRaw !== null) {
    try {
      const restored = restoreCheckpoint(JSON.parse(checkpointRaw));
      if (!restored) throw new Error('unsupported checkpoint');
      result.checkpoint = restored.checkpoint;
      result.emblemStatus = restored.emblemStatus;
      if (restored.emblemStatus === 'unsupported') result.checkpointWritable = false;
      if (restored.recovered || restored.emblemStatus === 'invalid') result.status = 'recovered';
    } catch {
      result.checkpointWritable = false;
    }
  }
  if (!result.controlsWritable || !result.checkpointWritable) {
    result.status = 'blocked';
    result.message = result.emblemStatus === 'unsupported'
      ? '新しい版の紋章記録を保持しています。読み込める章の進行で再開しますが、この章の変更は保存されません。'
      : !result.checkpointWritable
      ? '章の記録を読み込めませんでした。元の記録を保持し、安全な地点から始めます。この章の進行は保存されません。'
      : '操作設定を読み込めませんでした。元の設定を保持し、今回は標準設定を使います。操作設定の変更は保存されません。';
  } else if (!result.onboardingWritable) {
    result.status = 'blocked';
    result.message = '操作案内の記録を読み込めませんでした。章の進行と操作設定はそのまま使えます。';
  } else if (result.status === 'recovered') {
    result.message = result.emblemStatus === 'invalid'
      ? '紋章の記録を安全な状態に戻しました。元の記録を別に保持してから保存します。'
      : '保存位置を安全なチェックポイントへ戻しました。';
  }
  return result;
}

let progressEpoch = 0;
let controlsEpoch = 0;
let onboardingEpoch = 0;
let progressWritable = true;
let controlsWritable = true;
let onboardingWritable = true;
let latestOnboarding: FirstPersonOnboarding = { ...DEFAULT_FIRST_PERSON_ONBOARDING };
let latestCheckpoint: CheckpointState | undefined;
let pendingCheckpointBackup: string | undefined;
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
  const readOnboardingEpoch = onboardingEpoch;
  const [checkpointRead, controlsRead, onboardingRead] = await Promise.allSettled([
    AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY), AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY),
    AsyncStorage.getItem(FIRST_PERSON_ONBOARDING_KEY),
  ]);
  const result = decodeFirstPersonStorage(
    checkpointRead.status === 'fulfilled' ? checkpointRead.value : null,
    controlsRead.status === 'fulfilled' ? controlsRead.value : null,
    onboardingRead.status === 'fulfilled' ? onboardingRead.value : null,
  );
  if (checkpointRead.status === 'rejected') result.checkpointWritable = false;
  if (controlsRead.status === 'rejected') result.controlsWritable = false;
  if (onboardingRead.status === 'rejected') {
    result.onboardingWritable = false;
    result.status = 'blocked';
    result.message ??= '操作案内の記録を読み込めませんでした。章の進行と操作設定はそのまま使えます。';
  }
  if (!result.checkpointWritable || !result.controlsWritable) {
    result.status = 'blocked';
    result.message ??= '一人称の保存領域を読み込めませんでした。読み込めなかったデータへの保存を停止しています。';
  }
  if (readProgressEpoch === progressEpoch) {
    progressWritable = result.checkpointWritable;
    latestCheckpoint = result.checkpoint;
    pendingCheckpointBackup = checkpointRead.status === 'fulfilled' && checkpointRead.value !== null &&
      (result.emblemStatus === 'migrated' || result.emblemStatus === 'invalid') ? checkpointRead.value : undefined;
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
  if (readOnboardingEpoch === onboardingEpoch) {
    onboardingWritable = result.onboardingWritable;
    latestOnboarding = result.onboarding;
  } else {
    result.onboarding = { ...DEFAULT_FIRST_PERSON_ONBOARDING };
    result.onboardingWritable = false;
  }
  return result;
}

function doesNotRewind(previous: CheckpointState | undefined, next: CheckpointState): boolean {
  if (!previous) return true;
  const old = previous.progress;
  const fresh = next.progress;
  const oldEmblem = old.emblem;
  const nextEmblem = fresh.emblem;
  const phaseOrder = { unexamined: 0, observing: 1, released: 2 };
  if (oldEmblem && (!nextEmblem || oldEmblem.seed !== nextEmblem.seed ||
    phaseOrder[nextEmblem.phase] < phaseOrder[oldEmblem.phase] ||
    nextEmblem.attempts < oldEmblem.attempts || nextEmblem.hintTier < oldEmblem.hintTier ||
    (oldEmblem.compared && !nextEmblem.compared))) return false;
  return (!old.guideExamined || fresh.guideExamined) && (!old.markActivated || fresh.markActivated) &&
    (!old.sealA || fresh.sealA) && (!old.sealB || fresh.sealB) && (!old.exitDoorOpen || fresh.exitDoorOpen) && (!old.cleared || fresh.cleared) &&
    (old.variant !== 'exit' || fresh.variant === 'exit') && (!old.usedLookAssist || fresh.usedLookAssist);
}

/** Called only on semantic/checkpoint/pause events. No frame loop subscribes to storage. */
export function saveFirstPersonCheckpoint(checkpoint: CheckpointState, lease: number): Promise<boolean> {
  // Snapshot now: mutable runtime refs must not change the queued record later.
  const snapshot = JSON.stringify(checkpoint);
  return serializeMutation(async () => {
    if (!progressWritable || !isFirstPersonSessionCurrent(lease)) return false;
    const restored = restoreCheckpoint(JSON.parse(snapshot));
    // Migration belongs to loading existing data. A new command cannot smuggle
    // inconsistent emblem/seal-A fields through recovery and gain an unlock.
    if (!restored || restored.recovered || restored.emblemStatus !== 'valid' ||
      restored.checkpoint.chapterId !== CHAPTER_ID || restored.checkpoint.levelVersion !== LEVEL_VERSION) return false;
    try {
      // Also protect first writes made before hydration by direct consumers.
      if (!latestCheckpoint) {
        const previousRaw = await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY);
        if (!isFirstPersonSessionCurrent(lease)) return false;
        if (previousRaw !== null) {
          const previous = decodeFirstPersonStorage(previousRaw, null);
          if (!previous.checkpointWritable) { progressWritable = false; return false; }
          latestCheckpoint = previous.checkpoint;
          if (previous.emblemStatus === 'migrated' || previous.emblemStatus === 'invalid') pendingCheckpointBackup = previousRaw;
        }
      }
      if (!doesNotRewind(latestCheckpoint, restored.checkpoint)) return false;
      if (pendingCheckpointBackup !== undefined) {
        // Both operations share the same queue as reset and checkpoint writes.
        // Existing backup bytes are never overwritten, even on a later launch.
        const original = pendingCheckpointBackup;
        const backup = await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY);
        if (!isFirstPersonSessionCurrent(lease)) return false;
        if (backup === null) await AsyncStorage.setItem(FIRST_PERSON_PRE_EMBLEM_KEY, original);
        if (!isFirstPersonSessionCurrent(lease)) return false;
        pendingCheckpointBackup = undefined;
      }
      await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, JSON.stringify(restored.checkpoint));
      if (!isFirstPersonSessionCurrent(lease)) return false;
      latestCheckpoint = restored.checkpoint;
      return true;
    } catch {
      // A failed backup must never be followed by replacing the only old copy.
      return false;
    }
  });
}

export function saveFirstPersonControls(controls: FirstPersonControls, lease?: number): Promise<boolean> {
  const epoch = controlsEpoch;
  const document: ControlsDocument = { schemaVersion: 1, controls };
  const raw = JSON.stringify(document);
  return serializeMutation(async () => {
    if (!controlsWritable || epoch !== controlsEpoch ||
      (lease !== undefined && !isFirstPersonSessionCurrent(lease)) || !isFirstPersonControls(JSON.parse(raw).controls)) return false;
    try {
      await AsyncStorage.setItem(FIRST_PERSON_CONTROLS_KEY, raw);
      return epoch === controlsEpoch && (lease === undefined || isFirstPersonSessionCurrent(lease));
    } catch {
      return false;
    }
  });
}

/** Acknowledgements are monotonic and never write to a puzzle/calibration document. */
export function saveFirstPersonOnboarding(onboarding: FirstPersonOnboarding, lease: number): Promise<boolean> {
  const epoch = onboardingEpoch;
  const snapshot = { ...onboarding };
  return serializeMutation(async () => {
    if (!onboardingWritable || epoch !== onboardingEpoch || !isFirstPersonSessionCurrent(lease) ||
      !isFirstPersonOnboarding(snapshot)) return false;
    const next: FirstPersonOnboarding = {
      schemaVersion: 1,
      controlChoiceAcknowledged: latestOnboarding.controlChoiceAcknowledged || snapshot.controlChoiceAcknowledged,
      tutorialCompleted: latestOnboarding.tutorialCompleted || snapshot.tutorialCompleted,
    };
    try {
      await AsyncStorage.setItem(FIRST_PERSON_ONBOARDING_KEY, JSON.stringify(next));
      if (epoch !== onboardingEpoch || !isFirstPersonSessionCurrent(lease)) return false;
      latestOnboarding = next;
      return true;
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
      await AsyncStorage.multiRemove([FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_PRE_EMBLEM_KEY]);
      latestCheckpoint = undefined;
      pendingCheckpointBackup = undefined;
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
  onboardingEpoch += 1;
  onboardingWritable = false;
  progressWritable = false;
  controlsWritable = false;
  const applicationReset = resetApplicationStorage();
  const firstPersonReset = serializeMutation(async () => {
    try {
      await AsyncStorage.multiRemove([FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY, FIRST_PERSON_ONBOARDING_KEY, FIRST_PERSON_PRE_EMBLEM_KEY]);
      return true;
    } catch {
      return false;
    }
  });
  const [applicationRemoved, chapterRemoved] = await Promise.all([applicationReset, firstPersonReset]);
  const succeeded = applicationRemoved && chapterRemoved;
  latestCheckpoint = undefined;
  pendingCheckpointBackup = undefined;
  progressWritable = succeeded;
  controlsWritable = succeeded;
  onboardingWritable = succeeded;
  latestOnboarding = { ...DEFAULT_FIRST_PERSON_ONBOARDING };
  return succeeded;
}
