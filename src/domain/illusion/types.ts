export type Vec3 = { x: number; y: number; z: number };
export type Point = { x: number; y: number };
export type CameraId = 'a' | 'b';
export type CameraPose = { id: CameraId; horizontal: Vec3; vertical: Vec3; depth: Vec3 };

export type FloorNode = {
  id: string;
  label: string;
  position: Vec3;
  size: number;
  thickness: number;
  kind: 'floor' | 'stair' | 'bridge' | 'exit';
  pattern?: 'bars' | 'rings';
};
export type WalkEdge = {
  id: string;
  from: string;
  to: string;
  kind: 'walk' | 'stairs' | 'projection';
  bridgeId?: string;
};
export type ProjectionBridge = {
  id: string;
  edgeId: string;
  activeCamera: CameraId;
  endpoints: readonly [Vec3, Vec3];
};
export type Collectible = { id: string; nodeId: string };
export type LevelDefinition = {
  id: string;
  title: string;
  instruction: string;
  nodes: readonly FloorNode[];
  edges: readonly WalkEdge[];
  bridges: readonly ProjectionBridge[];
  collectibles: readonly Collectible[];
  spawnId: string;
  exitId: string;
  cameras: readonly CameraId[];
};

export type ProjectedFace = {
  id: string;
  nodeId: string;
  kind: 'top' | 'side';
  shade: 'top' | 'left' | 'right';
  points: readonly Point[];
  vertexDepths: readonly number[];
  depth: number;
};
export type ProjectedFloor = {
  nodeId: string;
  center: Point;
  polygon: readonly Point[];
  depth: number;
  visible: boolean;
};
export type ProjectedLevel = {
  width: number;
  height: number;
  scale: number;
  offset: Point;
  faces: readonly ProjectedFace[];
  floors: readonly ProjectedFloor[];
  occlusionFallbacks: readonly string[];
};

export type PendingMove = {
  session: number;
  token: number;
  from: string;
  to: string;
  kind: WalkEdge['kind'];
  edgeId: string;
};
export type LevelState = {
  levelId: string;
  session: number;
  currentNodeId: string;
  camera: CameraId;
  collected: readonly string[];
  discoveries: readonly string[];
  status: 'playing' | 'moving' | 'paused' | 'cleared';
  move: PendingMove | null;
  nextToken: number;
  neutralColors: boolean;
  assist: boolean;
  pausedFrom?: 'playing' | 'cleared';
};
export type LevelAction =
  | { type: 'move'; targetId: string }
  | { type: 'moveComplete'; session: number; token: number }
  | { type: 'camera'; camera: CameraId }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'toggleColors' }
  | { type: 'setAssist'; assist: boolean };
