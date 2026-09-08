import AsyncStorage from '@react-native-async-storage/async-storage';
import { createVaultCheckpoint, restoreVaultCheckpoint } from '../domain/vault/checkpoint';
import { createVaultRuntime } from '../domain/vault/runtime';
import { createGalleryRuntime, restoreGalleryCheckpoint, migrateGalleryV1Checkpoint, migrateGalleryV2Checkpoint } from '../domain/gallery';

import {
  CHAPTER_ID, LEVEL_VERSION, createCheckpoint, createInitialRuntime, restoreCheckpoint,
  type CheckpointState,
} from '../domain/firstPerson';
import {
  DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_FIRST_PERSON_ONBOARDING,
  type FirstPersonControls, type FirstPersonOnboarding,
} from '../types/application';
import { resetApplicationStorage } from './applicationStorage';

export const VAULT_CHECKPOINT_KEY = 'chroma-rift.uncanny-vault.v1';
export const VAULT_BACKUP_KEY = 'chroma-rift.uncanny-vault.backup.v1';

export const GALLERY_V1_CHECKPOINT_KEY = 'chroma-rift.perception-gallery.v1';
export const GALLERY_V1_BACKUP_KEY = 'chroma-rift.perception-gallery.backup.v1';
export const GALLERY_PRE_V2_KEY = 'chroma-rift.perception-gallery.pre-v2';
export const GALLERY_V2_CHECKPOINT_KEY = 'chroma-rift.perception-gallery.v2';
export const GALLERY_V2_BACKUP_KEY = 'chroma-rift.perception-gallery.backup.v2';
export const GALLERY_PRE_V3_KEY = 'chroma-rift.perception-gallery.pre-v3';
export const GALLERY_CHECKPOINT_KEY = 'chroma-rift.perception-gallery.v3';
export const GALLERY_BACKUP_KEY = 'chroma-rift.perception-gallery.backup.v3';

export const FIRST_PERSON_CHECKPOINT_KEY = 'chroma-rift.first-person.chapter.v1';
export const FIRST_PERSON_PRE_EMBLEM_KEY = 'chroma-rift.first-person.chapter.pre-emblem.v1';
export const FIRST_PERSON_CONTROLS_KEY = 'chroma-rift.first-person.controls.v1';
export const FIRST_PERSON_ONBOARDING_KEY = 'chroma-rift.first-person.onboarding.v1';

export type FirstPersonLoadResult = {
  hasCheckpoint: boolean;
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
    hasCheckpoint: checkpointRaw !== null,
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
let vaultWritable = true;
let latestVaultCheckpoint: CheckpointState | undefined;
let pendingVaultBackup: string | undefined;
let galleryWritable = true;
let latestGalleryCheckpoint: CheckpointState | undefined;
let pendingGalleryBackup: { key: string; raw: string } | undefined;
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
  galleryWritable = false;
  vaultWritable = false;
  const applicationReset = resetApplicationStorage();
  const firstPersonReset = serializeMutation(async () => {
    try {
      await AsyncStorage.multiRemove([FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY, FIRST_PERSON_ONBOARDING_KEY, FIRST_PERSON_PRE_EMBLEM_KEY, GALLERY_CHECKPOINT_KEY, GALLERY_BACKUP_KEY, GALLERY_V1_CHECKPOINT_KEY, GALLERY_V1_BACKUP_KEY, GALLERY_PRE_V2_KEY, GALLERY_V2_CHECKPOINT_KEY, GALLERY_V2_BACKUP_KEY, GALLERY_PRE_V3_KEY, VAULT_CHECKPOINT_KEY, VAULT_BACKUP_KEY]);
      return true;
    } catch {
      return false;
    }
  });
  const [applicationRemoved, chapterRemoved] = await Promise.all([applicationReset, firstPersonReset]);
  const succeeded = applicationRemoved && chapterRemoved;
  latestCheckpoint = undefined;
  pendingCheckpointBackup = undefined;
  latestGalleryCheckpoint = undefined;
  pendingGalleryBackup = undefined;
  latestVaultCheckpoint = undefined;
  pendingVaultBackup = undefined;
  vaultWritable = succeeded;
  galleryWritable = succeeded;
  progressWritable = succeeded;
  controlsWritable = succeeded;
  onboardingWritable = succeeded;
  latestOnboarding = { ...DEFAULT_FIRST_PERSON_ONBOARDING };
  return succeeded;
}


export type GalleryLoadResult = {
  checkpoint: CheckpointState;
  hasCheckpoint: boolean;
  checkpointWritable: boolean;
  status: 'empty' | 'loaded' | 'migrated' | 'recovered' | 'blocked';
  message?: string;
};
const initialGalleryCheckpoint = (): CheckpointState => createCheckpoint(createGalleryRuntime());

/** Decode v3 only: unknown/corrupt v3 must never fall back to an older version. */
export function decodeGalleryStorage(raw: string | null): GalleryLoadResult {
  const fallback: GalleryLoadResult = { checkpoint: initialGalleryCheckpoint(), hasCheckpoint: raw !== null,
    checkpointWritable: true, status: raw === null ? 'empty' : 'loaded' };
  if (raw === null) return fallback;
  try {
    const restored = restoreGalleryCheckpoint(JSON.parse(raw));
    if (!restored) throw new Error('unsupported gallery checkpoint');
    return { ...fallback, checkpoint: restored.checkpoint, status: restored.recovered ? 'recovered' : 'loaded',
      ...(restored.recovered ? { message: '展示室の保存位置を安全な場所へ戻しました。元の記録を別に保持してから保存します。' } : {}) };
  } catch {
    return { ...fallback, checkpointWritable: false, status: 'blocked',
      message: '展示室の記録を読み込めませんでした。元の記録を保持し、この章の変更は保存しません。新規に始める場合は、この章だけをリセットしてください。' };
  }
}

async function readGalleryDocument(): Promise<{ result: GalleryLoadResult; backup?: { key: string; raw: string } }> {
  const raw = await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY);
  if (raw !== null) {
    const result = decodeGalleryStorage(raw);
    return { result, ...(result.status === 'recovered' ? { backup: { key: GALLERY_BACKUP_KEY, raw } } : {}) };
  }
  const v2 = await AsyncStorage.getItem(GALLERY_V2_CHECKPOINT_KEY);
  const original = v2 ?? await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY);
  if (original === null) return { result: decodeGalleryStorage(null) };
  try {
    const migrated = v2 !== null ? migrateGalleryV2Checkpoint(JSON.parse(original)) : migrateGalleryV1Checkpoint(JSON.parse(original));
    if (!migrated) throw new Error('unsupported v1 gallery checkpoint');
    return { result: { checkpoint: migrated.checkpoint, hasCheckpoint: true, checkpointWritable: true, status: 'migrated',
      message: '以前の展示室の進行を引き継ぎます。元の記録を保持し、安全な地点から再開します。' },
      backup: { key: v2 !== null ? GALLERY_PRE_V3_KEY : GALLERY_PRE_V2_KEY, raw: original } };
  } catch {
    return { result: { checkpoint: initialGalleryCheckpoint(), hasCheckpoint: true, checkpointWritable: false, status: 'blocked',
      message: '以前の展示室の記録を読み込めませんでした。元の記録を保持し、この章の変更は保存しません。' } };
  }
}

export async function loadGalleryStorage(): Promise<GalleryLoadResult> {
  await mutations;
  const epoch = progressEpoch;
  try {
    const { result, backup } = await readGalleryDocument();
    if (epoch !== progressEpoch) return { checkpoint: initialGalleryCheckpoint(), hasCheckpoint: result.hasCheckpoint,
      status: 'blocked', checkpointWritable: false, message: '読み込み中に章が切り替わりました。' };
    galleryWritable = result.checkpointWritable;
    latestGalleryCheckpoint = result.hasCheckpoint ? result.checkpoint : undefined;
    pendingGalleryBackup = backup;
    return result;
  } catch {
    if (epoch === progressEpoch) galleryWritable = false;
    return { checkpoint: initialGalleryCheckpoint(), hasCheckpoint: false, status: 'blocked', checkpointWritable: false,
      message: '展示室の保存領域を読み込めませんでした。元のデータを保持し、保存を停止しています。' };
  }
}

function galleryDoesNotRewind(previous: CheckpointState | undefined, next: CheckpointState): boolean {
  const old = previous?.progress.gallery, fresh = next.progress.gallery;
  if (!fresh) return false;
  if (!old || !previous) return true;
  // The revised chapter owns power and exit progress. Old A/D flags are not
  // prerequisites, even inside the writer's monotonicity checks.
  return (!previous.progress.exitDoorOpen || next.progress.exitDoorOpen) && (!previous.progress.cleared || next.progress.cleared) &&
    old.seed === fresh.seed && old.shadow.seed === fresh.shadow.seed && old.shadow.variant === fresh.shadow.variant &&
    old.contour.seed === fresh.contour.seed && (!old.shadow.inspected || fresh.shadow.inspected) &&
    (!old.contour.inspected || fresh.contour.inspected) && (!old.shadow.solved || fresh.shadow.solved) &&
    (!old.contour.solved || fresh.contour.solved) && old.shadow.attempts <= fresh.shadow.attempts &&
    old.contour.attempts <= fresh.contour.attempts && old.order.length <= fresh.order.length &&
    old.order.every((puzzle, index) => fresh.order[index] === puzzle) &&
    (!old.emergencyLit || fresh.emergencyLit) && (!old.exitInspected || fresh.exitInspected) &&
    (!old.powerTaken.shadow || fresh.powerTaken.shadow) && (!old.powerTaken.contour || fresh.powerTaken.contour) &&
    (!old.powerConnected || fresh.powerConnected) && old.completedFromV1 === fresh.completedFromV1 &&
    old.completedFromV2 === fresh.completedFromV2 && (!old.finalDoorClosed || fresh.finalDoorClosed) &&
    (!old.wiring.inspected || fresh.wiring.inspected) &&
    (!old.wiring.solved || fresh.wiring.solved) && old.wiring.compatibleBypass === fresh.wiring.compatibleBypass &&
    old.wiring.attempts <= fresh.wiring.attempts &&
    (Object.keys(old.discoveries) as (keyof typeof old.discoveries)[]).every(key => !old.discoveries[key] || fresh.discoveries[key]) &&
    (['foreshadowed', 'absence', 'serviceWarned', 'resolved', 'crossingStarted', 'crossingPresented'] as const).every(key => !old.story[key] || fresh.story[key]);
}

export function saveGalleryCheckpoint(checkpoint: CheckpointState, lease: number): Promise<boolean> {
  const raw = JSON.stringify(checkpoint);
  return serializeMutation(async () => {
    if (!galleryWritable || !isFirstPersonSessionCurrent(lease)) return false;
    const restored = restoreGalleryCheckpoint(JSON.parse(raw));
    if (!restored || restored.recovered || restored.emblemStatus !== 'valid') return false;
    try {
      if (!latestGalleryCheckpoint) {
        const previous = await readGalleryDocument();
        if (!isFirstPersonSessionCurrent(lease)) return false;
        if (!previous.result.checkpointWritable) { galleryWritable = false; return false; }
        latestGalleryCheckpoint = previous.result.hasCheckpoint ? previous.result.checkpoint : undefined;
        pendingGalleryBackup = previous.backup;
      }
      if (!galleryDoesNotRewind(latestGalleryCheckpoint, restored.checkpoint)) return false;
      if (pendingGalleryBackup !== undefined) {
        const original = pendingGalleryBackup;
        const backup = await AsyncStorage.getItem(original.key);
        if (!isFirstPersonSessionCurrent(lease)) return false;
        if (backup === null) await AsyncStorage.setItem(original.key, original.raw);
        if (!isFirstPersonSessionCurrent(lease)) return false;
        pendingGalleryBackup = undefined;
      }
      await AsyncStorage.setItem(GALLERY_CHECKPOINT_KEY, JSON.stringify(restored.checkpoint));
      if (!isFirstPersonSessionCurrent(lease)) return false;
      latestGalleryCheckpoint = restored.checkpoint;
      return true;
    } catch { return false; }
  });
}

/** An explicit reset atomically replaces the current gallery. Removing it would
 * resurrect a retained older source on launch. Source and backup bytes stay intact. */
export function resetGalleryChapter(checkpoint: CheckpointState = initialGalleryCheckpoint()): Promise<boolean> {
  const raw = JSON.stringify(checkpoint);
  const restored = restoreGalleryCheckpoint(JSON.parse(raw));
  if (!restored || restored.recovered || restored.emblemStatus !== 'valid') return Promise.resolve(false);
  const epoch = ++progressEpoch;
  galleryWritable = false;
  return serializeMutation(async () => {
    if (epoch !== progressEpoch) return false;
    try {
      await AsyncStorage.setItem(GALLERY_CHECKPOINT_KEY, JSON.stringify(restored.checkpoint));
      if (epoch !== progressEpoch) return false;
      latestGalleryCheckpoint = restored.checkpoint;
      pendingGalleryBackup = undefined;
      galleryWritable = true;
      return true;
    } catch { return false; }
  });
}


export type VaultLoadResult = {
  checkpoint: CheckpointState; hasCheckpoint: boolean; checkpointWritable: boolean;
  status: 'empty' | 'loaded' | 'recovered' | 'blocked'; message?: string;
};
const initialVaultCheckpoint = (): CheckpointState => createVaultCheckpoint(createVaultRuntime());

/** This chapter has no predecessor key. Never reinterpret another chapter or
 * an unknown vault version as a new run, even when saving before hydration. */
export function decodeVaultStorage(raw: string | null): VaultLoadResult {
  const fallback: VaultLoadResult = { checkpoint: initialVaultCheckpoint(), hasCheckpoint: raw !== null,
    checkpointWritable: true, status: raw === null ? 'empty' : 'loaded' };
  if (raw === null) return fallback;
  try {
    const restored = restoreVaultCheckpoint(JSON.parse(raw));
    if (!restored) throw new Error('unsupported vault checkpoint');
    return { ...fallback, checkpoint: restored.checkpoint, status: restored.recovered ? 'recovered' : 'loaded',
      ...(restored.recovered ? { message: '収蔵庫の保存位置を安全な場所へ戻しました。元の記録を別に保持してから保存します。' } : {}) };
  } catch {
    return { ...fallback, checkpointWritable: false, status: 'blocked',
      message: '収蔵庫の記録を読み込めませんでした。元の記録を保持し、この章の変更は保存しません。新規に始める場合は、この章だけをリセットしてください。' };
  }
}
async function readVaultDocument(): Promise<{ result: VaultLoadResult; backup?: string }> {
  const raw = await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY), result = decodeVaultStorage(raw);
  return { result, ...(raw !== null && result.status === 'recovered' ? { backup: raw } : {}) };
}
export async function loadVaultStorage(): Promise<VaultLoadResult> {
  await mutations;
  const epoch = progressEpoch;
  try {
    const { result, backup } = await readVaultDocument();
    if (epoch !== progressEpoch) return { checkpoint: initialVaultCheckpoint(), hasCheckpoint: result.hasCheckpoint,
      status: 'blocked', checkpointWritable: false, message: '読み込み中に章が切り替わりました。' };
    vaultWritable = result.checkpointWritable;
    latestVaultCheckpoint = result.hasCheckpoint ? result.checkpoint : undefined;
    pendingVaultBackup = backup;
    return result;
  } catch {
    if (epoch === progressEpoch) vaultWritable = false;
    return { checkpoint: initialVaultCheckpoint(), hasCheckpoint: false, status: 'blocked', checkpointWritable: false,
      message: '収蔵庫の保存領域を読み込めませんでした。元のデータを保持し、保存を停止しています。' };
  }
}
function vaultDoesNotRewind(previous: CheckpointState | undefined, next: CheckpointState): boolean {
  const old = previous?.progress.vault, fresh = next.progress.vault;
  if (!fresh) return false;
  if (!old || !previous) return true;
  return old.seed === fresh.seed && old.specVersion === fresh.specVersion &&
    (!old.length.solved || fresh.length.solved && old.length.length === fresh.length.length) &&
    (!old.rod.solved || fresh.rod.solved && old.rod.angle === fresh.rod.angle) &&
    old.length.attempts <= fresh.length.attempts && old.rod.attempts <= fresh.rod.attempts &&
    (!old.finalDoorClosed || fresh.finalDoorClosed) && (!previous.progress.cleared || next.progress.cleared) &&
    (Object.keys(old.discoveries) as (keyof typeof old.discoveries)[]).every(key => !old.discoveries[key] || fresh.discoveries[key]) &&
    (Object.keys(old.story) as (keyof typeof old.story)[]).every(key => !old.story[key] || fresh.story[key]);
}
export function saveVaultCheckpoint(checkpoint: CheckpointState, lease: number): Promise<boolean> {
  const raw = JSON.stringify(checkpoint);
  return serializeMutation(async () => {
    if (!vaultWritable || !isFirstPersonSessionCurrent(lease)) return false;
    const restored = restoreVaultCheckpoint(JSON.parse(raw));
    if (!restored || restored.recovered) return false;
    try {
      if (!latestVaultCheckpoint) {
        const previous = await readVaultDocument();
        if (!isFirstPersonSessionCurrent(lease)) return false;
        if (!previous.result.checkpointWritable) { vaultWritable = false; return false; }
        latestVaultCheckpoint = previous.result.hasCheckpoint ? previous.result.checkpoint : undefined;
        pendingVaultBackup = previous.backup;
      }
      if (!vaultDoesNotRewind(latestVaultCheckpoint, restored.checkpoint)) return false;
      if (pendingVaultBackup !== undefined) {
        const backup = await AsyncStorage.getItem(VAULT_BACKUP_KEY);
        if (!isFirstPersonSessionCurrent(lease)) return false;
        if (backup === null) await AsyncStorage.setItem(VAULT_BACKUP_KEY, pendingVaultBackup);
        if (!isFirstPersonSessionCurrent(lease)) return false;
        pendingVaultBackup = undefined;
      }
      await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, JSON.stringify(restored.checkpoint));
      if (!isFirstPersonSessionCurrent(lease)) return false;
      latestVaultCheckpoint = restored.checkpoint;
      return true;
    } catch { return false; }
  });
}
/** Replace only this chapter after explicit reset. The shared epoch rejects all
 * retired scene callbacks; the shared writer orders reset after active writes. */
export function resetVaultChapter(checkpoint: CheckpointState = initialVaultCheckpoint()): Promise<boolean> {
  const restored = restoreVaultCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
  if (!restored || restored.recovered) return Promise.resolve(false);
  const epoch = ++progressEpoch;
  vaultWritable = false;
  return serializeMutation(async () => {
    if (epoch !== progressEpoch) return false;
    try {
      await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, JSON.stringify(restored.checkpoint));
      if (epoch !== progressEpoch) return false;
      latestVaultCheckpoint = restored.checkpoint;
      pendingVaultBackup = undefined;
      vaultWritable = true;
      return true;
    } catch { return false; }
  });
}
