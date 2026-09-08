import { createVaultRuntime } from '../../domain/vault/runtime';
import { createVaultCheckpoint } from '../../domain/vault/checkpoint';
import { VAULT_CHECKPOINTS } from '../../domain/vault/definition';
import { LENGTH_SPEC } from '../../domain/vault/specs';
import type { VaultCheckpointId } from '../../domain/vault/types';

/** Valid semantic stages built on the real current runtime, for boundary
 * tests only. UI and controller route tests exercise actual puzzle commands. */
export function vaultRuntime(stage: 'entry' | 'length' | 'rod' | 'clear' = 'entry', seed = 109, refuge?: VaultCheckpointId) {
  const runtime = createVaultRuntime(undefined, undefined, seed), progress = runtime.progress.vault!;
  if (stage !== 'entry') progress.length = { length: LENGTH_SPEC.targetLength, solved: true, attempts: 1 };
  if (stage === 'rod' || stage === 'clear') { progress.rod = { angle: 0, solved: true, attempts: 1 }; runtime.progress.exitDoorOpen = true; }
  if (stage === 'clear') { progress.finalDoorClosed = true; runtime.progress.cleared = true; }
  const id = refuge ?? (stage === 'clear' ? 'exit' : stage !== 'entry' ? 'brake' : 'entry');
  runtime.vault!.checkpointId = id; runtime.vault!.lastSafePose = VAULT_CHECKPOINTS[id];
  return runtime;
}
export function vaultCheckpoint(stage: 'entry' | 'length' | 'rod' | 'clear' = 'entry', seed = 109, refuge?: VaultCheckpointId) {
  return createVaultCheckpoint(vaultRuntime(stage, seed, refuge));
}
