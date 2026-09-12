import type { PlayerPose, Vec3 } from '../firstPerson/types';
import type { VaultActor } from '../vault/types';
import type { TheatreBellId, TheatreEnvironment } from './environment';

export type TheatreDiscovery = 'shadow' | 'depth';
export type TheatreCheckpointId = 'entry' | 'projector' | 'booth' | 'exit';
export type TheatreProgress = {
  schemaVersion: 1; specVersion: 1; seed: number;
  light: { rail: number; accepted: boolean; attempts: number };
  inspectionShutterOpen: boolean; bypassOpen: boolean;
  discoveries: Record<TheatreDiscovery, boolean>;
  story: { crossingStarted: boolean; crossingPresented: boolean; projectorUsed: boolean };
  curtainAccepted: boolean; passageSealed: boolean; completed: boolean;
};
export type TheatreActor = Omit<VaultActor, 'phase'> & { phase: VaultActor['phase'] | 'crossing'; crossingIndex: number };
export type TheatreNoise = { sequence: number; position: Vec3; strength: number; kind: 'footstep' | 'metal' | 'projector' | 'bell' };
export type TheatreDrag = {
  kind: 'light' | 'projector'; pointerId: number; startValue: number; startPoint: { x: number; y: number };
  lastPointerAngle: number; crankTravel: number;
};
export type TheatreTransient = {
  sessionId: string; lastSeq: number; lastNowMs: number; mode: 'explore' | 'light';
  rail: number; lightDragCompleted: boolean; activeDrag: TheatreDrag | null; actor: TheatreActor;
  lastSafePose: PlayerPose; checkpointId: TheatreCheckpointId;
  lightGateOpen: number; curtainOpenness: number; curtainSeconds: number;
  projectorSeconds: number; projectorCooldown: number; projectorPulseSeconds: number;
  projectorArmed: boolean; projectorCrankTravel: number; projectorAngle: number; projectorNoise?: TheatreNoise | undefined; noiseSequence: number; noiseDistance: number;
  environment: TheatreEnvironment; environmentNoise?: TheatreNoise | undefined;
  feedback?: { correct: boolean; sequence: number; remainingSeconds: number } | undefined;
};
export type TheatreAction =
  | { type: 'enter-light' | 'enter-projector' | 'leave' | 'cancel' | 'commit-light' | 'open-inspection' | 'inspect-depth' | 'open-bypass' | 'lower-curtain' }
  | { type: 'adjust-light'; delta: number }
  | { type: 'activate-instance'; instanceId: TheatreBellId | 'theatre-manual-shutter' }
  | { type: 'drag-start'; kind: 'light' | 'projector'; pointerId: number; point: { x: number; y: number } }
  | { type: 'drag-move'; pointerId: number; point: { x: number; y: number } }
  | { type: 'drag-end'; pointerId: number; inside: boolean }
  | { type: 'crank-step'; delta: number };
export type TheatreCommand = { sessionId: string; seq: number; nowMs: number; action: TheatreAction };
