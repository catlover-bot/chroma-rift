export type Vec3 = { x: number; y: number; z: number };
export type PlayerPose = { position: Vec3; yaw: number; pitch: number };
export type MovementInput = { strafe: number; forward: number };
export type CameraMatrices = { view: readonly number[]; projection: readonly number[] };
export type FloorRegion = { id: string; minX: number; maxX: number; minZ: number; maxZ: number };
export type RoomVariant = 'entrance' | 'exit';
export type CollisionVolume = {
  id: string; min: Vec3; max: Vec3; kind: 'wall' | 'door' | 'device'; opaque: boolean;
};
export type InteractableId = 'guide' | 'floor-device' | 'key' | 'exit';
export type InteractableDefinition = {
  id: InteractableId; label: string; center: Vec3; radius: number; maxDistance: number;
};
export type KeyFragment = { id: string; points: readonly Vec3[]; strokeWidth: number };
export type KeyFrame = { center: Vec3; width: number; height: number; outline: readonly (readonly Vec3[])[] };
export type WorldGeometry = {
  variant: RoomVariant; floors: readonly FloorRegion[]; solids: readonly CollisionVolume[];
  interactables: readonly InteractableDefinition[]; colorPanels: readonly FloorRegion[];
  keyFragments: readonly KeyFragment[]; keyFrame: KeyFrame;
};
export type HintStage = 0 | 1 | 2 | 3;
export type PuzzleState = {
  guideExamined: boolean; markActivated: boolean; sealA: boolean; sealB: boolean;
  variant: RoomVariant; exitDoorOpen: boolean; cleared: boolean; hintStage: HintStage; usedLookAssist: boolean;
};
export type ChapterRuntime = {
  pose: PlayerPose; progress: PuzzleState; session: number; paused: boolean;
  alignment: boolean; doorAOpen: number; doorBOpen: number; doorExitOpen: number;
};
export type CheckpointState = {
  schemaVersion: 1; chapterId: string; levelVersion: number;
  pose: PlayerPose; progress: PuzzleState;
};
export type PuzzlePrerequisite = 'guideExamined' | 'markActivated' | 'sealA' | 'keyAlignment';
export type PuzzleDefinition = {
  id: 'unbroken-floor' | 'overlapping-key';
  title: string;
  prerequisites: readonly PuzzlePrerequisite[];
  clues: readonly string[];
  action: { type: 'inspect' | 'align'; target: 'floor-device' | 'key' };
  success: { seal: 'sealA' | 'sealB'; opensDoor: 'seal-a-door' | 'seal-b-door' };
  hints: readonly [string, string, string];
};
export type ChapterDefinition = {
  id: string; version: number; title: string; spawn: PlayerPose;
  rooms: readonly FloorRegion[]; checkpoints: readonly PlayerPose[];
  puzzles: readonly [PuzzleDefinition, PuzzleDefinition];
};
