import { createInitialRuntime } from '../firstPerson/runtime';
import { CHAPTER_ID } from '../firstPerson/chapter';
import type { CheckpointState, ChapterRuntime } from '../firstPerson/types';
import { VAULT_CHAPTER_ID, VAULT_SEED, VAULT_SPAWN } from './definition';
import { initialVaultProgress, initialVaultTransient } from './state';
/** Separate logical chapter; this constructor never borrows gallery unlocks. */
export function createVaultRuntime(checkpoint?: CheckpointState, session?: number, seed = VAULT_SEED): ChapterRuntime {
  const accepted = checkpoint?.chapterId === VAULT_CHAPTER_ID ? checkpoint : undefined;
  const base = createInitialRuntime(undefined, session, CHAPTER_ID), saved = accepted?.progress.vault ?? initialVaultProgress(seed);
  const pose = accepted?.pose ?? VAULT_SPAWN;
  const progress = { ...base.progress, vault: saved, exitDoorOpen: saved.rod.solved, cleared: saved.finalDoorClosed };
  return { ...base, chapterId: VAULT_CHAPTER_ID, progress, pose: { ...pose, position: { ...pose.position } },
    vault: initialVaultTransient(saved, String(base.session), pose) };
}
