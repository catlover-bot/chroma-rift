import type { TheatreProgress, TheatreTransient } from '../theatre/types';
import type { VaultProgress, VaultTransient } from '../vault/types';
import type { GalleryProgress, GalleryTransient } from '../gallery/types';
import type { SealCheckpoint, SealState } from '../emblem/puzzle';
import type { Glyph } from '../emblem/stimulus';
import type { StageTargetId } from '../stageKit/definitions';

export type Vec3 = { x: number; y: number; z: number };
export type PlayerPose = { position: Vec3; yaw: number; pitch: number };
export type MovementInput = { strafe: number; forward: number };
export type CameraMatrices = { view: readonly number[]; projection: readonly number[] };
export type FloorRegion = { id: string; minX: number; maxX: number; minZ: number; maxZ: number };
export type RoomVariant = 'entrance' | 'exit';
export type CollisionVolume = {
  id: string; min: Vec3; max: Vec3; kind: 'wall' | 'door' | 'device'; opaque: boolean;
};
export type InteractableId = StageTargetId;
export type RectangleInteractionTarget = {
  width: number; height: number; normal: Vec3; right: Vec3;
};
export type InteractableDefinition<Id extends string = InteractableId> = {
  id: Id; label: string; center: Vec3; radius: number; maxDistance: number;
  /** Whole visible plate; radius is ignored. Up is normal cross right. */
  rectangle?: RectangleInteractionTarget;
};
export type KeyFragment = { id: string; points: readonly Vec3[]; strokeWidth: number };
export type KeyFrame = { center: Vec3; width: number; height: number; outline: readonly (readonly Vec3[])[] };
export type WorldGeometry<Id extends string = InteractableId> = {
  chapterId?: string; keyObservationPose?: PlayerPose;
  variant: RoomVariant; floors: readonly FloorRegion[]; solids: readonly CollisionVolume[];
  interactables: readonly InteractableDefinition<Id>[]; colorPanels: readonly FloorRegion[];
  keyFragments: readonly KeyFragment[]; keyFrame: KeyFrame;
};
export type HintStage = 0 | 1 | 2 | 3;
export type PuzzleState = {
  theatre?: TheatreProgress;
  vault?: VaultProgress;
  gallery?: GalleryProgress;
  /** Legacy monotonic flags only; the emblem has no guide/floor prerequisites. */
  emblem?: SealCheckpoint;
  guideExamined: boolean; markActivated: boolean; sealA: boolean; sealB: boolean;
  variant: RoomVariant; exitDoorOpen: boolean; cleared: boolean; hintStage: HintStage; usedLookAssist: boolean;
};
export type ChapterRuntime = {
  theatre?: TheatreTransient;
  vault?: VaultTransient;
  chapterId?: string; gallery?: GalleryTransient;
  pose: PlayerPose; progress: PuzzleState; session: number; paused: boolean;
  emblem: SealState;
  switchFeedback?: { glyph: Glyph; correct: boolean; sequence: number; remainingSeconds: number } | undefined;
  alignment: boolean; doorAOpen: number; doorBOpen: number; doorExitOpen: number;
  /** A validated, module-owned session. The host never reads its payload. */
  stageSession?: { stageId: string; value: unknown };
};
export type CheckpointState = {
  schemaVersion: 1; chapterId: string; levelVersion: number;
  pose: PlayerPose; progress: PuzzleState;
  /** Only the matching module codec may decode this value. */
  stageData?: unknown;
};
export type PuzzlePrerequisite = 'guideExamined' | 'markActivated' | 'sealA' | 'keyAlignment';
export type PuzzleDefinition = {
  id: 'unbroken-floor' | 'untouchable-emblem' | 'overlapping-key';
  title: string;
  prerequisites: readonly PuzzlePrerequisite[];
  clues: readonly string[];
  action: { type: 'inspect' | 'align'; target: 'floor-device' | 'emblem-panel' | 'key' };
  success: { seal: 'sealA' | 'sealB'; opensDoor: 'seal-a-door' | 'seal-b-door' };
  hints: readonly [string, string, string];
};
export type ChapterDefinition = {
  id: string; version: number; title: string; spawn: PlayerPose;
  rooms: readonly FloorRegion[]; checkpoints: readonly PlayerPose[];
  puzzles: readonly [PuzzleDefinition, PuzzleDefinition];
};
