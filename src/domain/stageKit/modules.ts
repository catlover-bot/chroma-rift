import type { ChapterRuntime, CheckpointState, InteractableId, Vec3, WorldGeometry } from '../firstPerson/types';
import type { InputPolicy } from './actionInstance';
import { THEATRE_BELLS } from '../theatre/environment';
import { STAGE_DEFINITIONS, type StageId } from './definitions';
import { createTheatreRuntime } from '../theatre/runtime';
import { advanceTheatre, applyTheatreCommand } from '../theatre/state';
import { getTheatreWorld } from '../theatre/world';
import { theatreHint, theatreObjective } from '../theatre/selectors';
import { createTheatreCheckpoint, restoreTheatreCheckpoint } from '../theatre/checkpoint';
import type { TheatreCommand } from '../theatre/types';
import { createVaultRuntime } from '../vault/runtime';
import { advanceVault, applyVaultCommand } from '../vault/state';
import { getVaultWorld } from '../vault/world';
import { vaultHint, vaultObjective } from '../vault/selectors';
import { createVaultCheckpoint, restoreVaultCheckpoint } from '../vault/checkpoint';
import type { VaultCommand } from '../vault/types';
import { createGalleryRuntime } from '../gallery/runtime';
import { advanceGallery, applyGalleryCommand } from '../gallery/state';
import { getGalleryWorld } from '../gallery/world';
import { galleryObjective } from '../gallery/selectors';
import { galleryHint } from '../gallery/hint';
import { createGalleryCheckpoint, restoreGalleryCheckpoint } from '../gallery/checkpoint';
import type { GalleryCommand } from '../gallery/types';
import { stageBinding as stageKitProbe } from '../stages/stage-kit-probe/binding';

export type StagePresentation = { objective: string; hint: { text: string; target?: Vec3 } };
export type StageModule<C, R> = Readonly<{
  id: StageId;
  create(checkpoint?: CheckpointState, session?: number): ChapterRuntime;
  advance(runtime: ChapterRuntime, dt: number): ChapterRuntime;
  world(runtime: ChapterRuntime): WorldGeometry;
  present(runtime: ChapterRuntime): StagePresentation;
  command(runtime: ChapterRuntime, command: C, context: { rendererReady: boolean; foreground: boolean; targetId: string | null }): R;
  checkpoint(runtime: ChapterRuntime): CheckpointState;
  restore(value: unknown): { checkpoint: CheckpointState; recovered: boolean } | undefined;
  /** Required for new simple stages using the generic persistence path. */
  canReplaceCheckpoint?(previous: CheckpointState, next: CheckpointState): boolean;
  renderKind: 'theatre' | 'vault' | 'gallery' | 'simple';
  inputPolicy(runtime: ChapterRuntime): InputPolicy;
  interact?(runtime: ChapterRuntime, targetId: InteractableId): ChapterRuntime;
}>;
const explorePolicy: InputPolicy = { move: true, look: true, pointer: 'none', dangerAdvances: true, end: 'release' };
const safeAdjustmentPolicy: InputPolicy = { move: false, look: false, pointer: 'exclusive', dangerAdvances: false, end: 'explicit' };
const dangerousAdjustmentPolicy: InputPolicy = { move: false, look: false, pointer: 'exclusive', dangerAdvances: true, end: 'release' };

const theatre: StageModule<TheatreCommand, ReturnType<typeof applyTheatreCommand>> = {
  id: 'shadow-theatre-v1', create: (checkpoint,session) => {
    if(checkpoint&&checkpoint.chapterId!=='shadow-theatre-v1')throw new RangeError('Foreign theatre checkpoint');
    return createTheatreRuntime(checkpoint,session);
  }, advance: advanceTheatre, world: getTheatreWorld,
  present: runtime => ({ objective: theatreObjective(runtime), hint: theatreHint(runtime) }),
  command: (runtime,command,context) => runtime.chapterId==='shadow-theatre-v1'?applyTheatreCommand(runtime,command,context):{runtime,accepted:false,stopInput:false,message:''}, checkpoint: createTheatreCheckpoint, restore: restoreTheatreCheckpoint, renderKind: 'theatre',
  inputPolicy: runtime => runtime.theatre?.mode==='light'?safeAdjustmentPolicy:runtime.theatre?.projectorArmed?dangerousAdjustmentPolicy:THEATRE_BELLS[0]!.input,
};
const vault: StageModule<VaultCommand, ReturnType<typeof applyVaultCommand>> = {
  id: 'uncanny-vault-v1', create: (checkpoint,session) => {
    if(checkpoint&&checkpoint.chapterId!=='uncanny-vault-v1')throw new RangeError('Foreign vault checkpoint');
    return createVaultRuntime(checkpoint,session);
  }, advance: advanceVault, world: getVaultWorld,
  present: runtime => ({ objective: vaultObjective(runtime), hint: vaultHint(runtime) }),
  command: (runtime,command,context) => runtime.chapterId==='uncanny-vault-v1'?applyVaultCommand(runtime,command,context):{runtime,accepted:false,stopInput:false,message:''}, checkpoint: createVaultCheckpoint, restore: restoreVaultCheckpoint, renderKind: 'vault',
  inputPolicy: runtime => runtime.vault?.mode==='explore'?explorePolicy:safeAdjustmentPolicy,
};
const gallery: StageModule<GalleryCommand, ReturnType<typeof applyGalleryCommand>> = {
  id: 'perception-gallery-v1', create: createGalleryRuntime, advance: advanceGallery, world: getGalleryWorld,
  present: runtime => ({ objective: galleryObjective(runtime), hint: galleryHint(runtime) }),
  command: (runtime,command,context) => runtime.chapterId==='perception-gallery-v1'?applyGalleryCommand(runtime,command,context):{runtime,accepted:false,reason:'wrong-target',effects:[]},
  checkpoint: createGalleryCheckpoint, restore: restoreGalleryCheckpoint, renderKind: 'gallery',
  inputPolicy: runtime => runtime.gallery?.mode==='explore'?explorePolicy:safeAdjustmentPolicy,
};

/** Explicit imports are intentional: a new stage has one composition point. */
export const STAGE_MODULES = { 'shadow-theatre-v1': theatre, 'uncanny-vault-v1': vault, 'perception-gallery-v1': gallery, 'stage-kit-probe': stageKitProbe } as const;
export type ModuleStageId = keyof typeof STAGE_MODULES;
export function stageModule(id: unknown): (typeof STAGE_MODULES)[ModuleStageId] | undefined {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(STAGE_MODULES, id) ? STAGE_MODULES[id as ModuleStageId] : undefined;
}
export function stageInputPolicy(runtime: ChapterRuntime): InputPolicy {
  return stageModule(runtime.chapterId)?.inputPolicy(runtime)??explorePolicy;
}
export function validateStageModules(): string[] {
  const errors: string[] = [];
  for (const definition of STAGE_DEFINITIONS) {
    const module = stageModule(definition.id);
    if (definition.binding === 'module' && !module) errors.push(`${definition.id}: missing module`);
    if (module && (module.id !== definition.id || module.renderKind !== definition.renderKind)) errors.push(`${definition.id}: binding mismatch`);
    if (module?.renderKind === 'simple' && !module.canReplaceCheckpoint) errors.push(`${definition.id}: missing checkpoint progression rule`);
  }
  for (const id of Object.keys(STAGE_MODULES)) if (!STAGE_DEFINITIONS.some(stage => stage.id === id)) errors.push(`${id}: unregistered module`);
  return errors;
}
