import type { ActorMotionState } from '../actorMotion';
import type { PlayerPose, Vec3 } from '../firstPerson/types';

export type VaultDevice = 'length' | 'rod';
export type VaultDiscovery = 'length' | 'rod' | 'cafe';
export type VaultCheckpointId = 'entry' | 'brake' | 'exit';
export type VaultProgress = {
  schemaVersion: 1; specVersion: 1; seed: number;
  length: { length: number; solved: boolean; attempts: number };
  rod: { angle: number; solved: boolean; attempts: number };
  discoveries: Record<VaultDiscovery, boolean>;
  aids: { finsHidden: boolean; lengthGuide: boolean; frameHidden: boolean; plumb: boolean; cafeNeutral: boolean };
  story: { revealStarted: boolean; revealPresented: boolean; finalPursuitStarted: boolean };
  finalDoorClosed: boolean;
};
export type VaultActorPhase = 'idle' | 'listen' | 'patrol' | 'investigate' | 'notice' | 'pursue' | 'windup' | 'attack' | 'recover' | 'search' | 'return' | 'resolved';
export type VaultActor = {
  motion: ActorMotionState; visible: boolean; phase: VaultActorPhase; phaseTime: number;
  lastSeen?: Vec3 | undefined; lastHeard?: Vec3 | undefined; recognition: number;
  routeIndex: number; searchIndex: number; startupGrace: number; contactCooldown: number;
  attackTarget?: Vec3 | undefined; attackCommitted: boolean; attackHit: boolean;
  lastNoiseSequence: number; intensity: 'standard' | 'subdued';
  navigationPath: readonly Vec3[]; navigationTarget?: Vec3 | undefined; repathSeconds: number;
  revealTime: number; searchOrigin?: Vec3 | undefined; searchDwellSeconds: number;
};
export type VaultDrag = {
  puzzle: VaultDevice; pointerId: number; startValue: number; startPoint: { x: number; y: number };
  lastPointerAngle: number;
};
export type VaultTransient = {
  sessionId: string; lastSeq: number; lastNowMs: number; mode: 'explore' | VaultDevice;
  actor: VaultActor; lastSafePose: PlayerPose; checkpointId: VaultCheckpointId;
  length: number; angle: number; activeDrag: VaultDrag | null;
  lengthGateOpen: number; brakeGateOpen: number; partitionClosed: boolean;
  exitClosureSeconds: number; revealSeconds: number;
  noiseDistance: number; noiseSequence: number;
  feedback?: { puzzle: VaultDevice; correct: boolean; sequence: number; remainingSeconds: number } | undefined;
};
export type VaultAction =
  | { type: 'enter'; puzzle: VaultDevice }
  | { type: 'leave' | 'cancel' | 'commit' | 'close-exit' | 'close-partition' | 'cafe-inspect' }
  | { type: 'aid'; aid: keyof VaultProgress['aids']; enabled: boolean }
  | { type: 'adjust'; delta: number }
  | { type: 'drag-start'; pointerId: number; point: { x: number; y: number } }
  | { type: 'drag-move'; pointerId: number; point: { x: number; y: number } }
  | { type: 'drag-end'; pointerId: number; inside: boolean };
export type VaultCommand = { sessionId: string; seq: number; nowMs: number; action: VaultAction };
export type VaultNoise = { sequence: number; position: Vec3; strength: number; kind: 'footstep' | 'metal' };
