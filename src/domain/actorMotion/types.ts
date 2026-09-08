import type { Vec3 } from '../firstPerson/types';
export type ActorGait = 'idle' | 'listen' | 'patrol' | 'investigate' | 'notice' | 'pursue' | 'windup' | 'attack' | 'recover' | 'search' | 'return';
export type ActorFootName = 'left' | 'right';
export type ActorFootPlant = { foot: ActorFootName; sequence: number; position: Vec3 };
export type ActorFoot = { name: ActorFootName; position: Vec3; anchor: Vec3; from: Vec3; yaw: number; fromYaw: number; stance: boolean; swingTime: number; swingDuration: number };
/** Transient simulation data. Neither poses nor clocks belong in a save. */
export type ActorMotionState = {
  position: Vec3; yaw: number; desiredHeading: number; angularVelocity: number;
  velocity: Vec3; speed: number; travelledDistance: number; accumulator: number;
  headYaw: number; headPitch: number; chestYaw: number; chestLean: number; pelvisShift: number;
  turnAge: number; launchAge: number; movingIntent: boolean; gait: ActorGait; gaitTime: number;
  feet: [ActorFoot, ActorFoot]; swingFoot: 0 | 1 | null; nextFoot: 0 | 1; plantSequence: number;
};
export type ActorMotionIntent = { target?: Vec3; desiredHeading?: number; lookTarget?: Vec3; maxSpeed: number; gait: ActorGait };
export type ActorMotionStep = { state: ActorMotionState; movedDistance: number; footPlants: ActorFootPlant[] };
export type ActorMotionTraversal = (from: Vec3, to: Vec3) => boolean;
export type ActorPose = { pelvisShift: number; chestYaw: number; chestLean: number; headPosition: Vec3; headYaw: number; headPitch: number; headRoll: number;
  leftArm: number; rightArm: number; leftElbow: number; rightElbow: number; leftFoot: { position: Vec3; yaw: number; stance: boolean }; rightFoot: { position: Vec3; yaw: number; stance: boolean } };
