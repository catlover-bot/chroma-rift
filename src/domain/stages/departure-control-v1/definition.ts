import { ACTOR_COLLISION_RADIUS, ACTOR_MODEL_BOUNDS } from '../../actorMotion/envelope';
import type { PlayerPose, Vec3, WorldGeometry } from '../../firstPerson/types';
import { CONTAINMENT_DOOR_BOUNDS, containmentDoorSolids } from './containmentDoor';

export const STAGE_ID = 'departure-control-v1' as const;
export const STAGE_TITLE = '退館制御室';
export type TargetId = 'departure-key' | 'departure-procedure' | 'departure-bell' | 'departure-door' |
  'departure-reopen' | 'departure-stop' | 'departure-staff-door' | 'departure-outdoor';
export const SPAWN: PlayerPose = { position: { x: -3.75, y: 1.6, z: 11.6 }, yaw: -2.15, pitch: 0 };
export const CONTROL_SAFE: PlayerPose = { position: { ...SPAWN.position }, yaw: SPAWN.yaw, pitch: SPAWN.pitch };
/** The key socket, receiver and containment entrance share the protected forward view. */
export const CONTROL_KEY_ENTRY: PlayerPose = { position: { ...SPAWN.position },
  yaw: Math.atan2(-.2, -1.35), pitch: Math.atan2(-.48, Math.hypot(.2, 1.35)) };
// Exact r8 checkpoint poses remain readable after the console was relocated.
export const LEGACY_CONTROL_SAFE: PlayerPose = { position: { x:-3.75,y:1.6,z:10 }, yaw:Math.PI,pitch:0 };
export const LEGACY_CONTROL_KEY_ENTRY: PlayerPose = { position: { x:-3.75,y:1.6,z:10 }, yaw:Math.PI/4,pitch:Math.atan2(-.2,Math.SQRT2) };
export const STAFF_EXIT_SAFE: PlayerPose = { position: { x: -3.75, y: 1.6, z: 17.2 }, yaw: Math.PI, pitch: 0 };
export const OUTDOOR: PlayerPose = { position: { x: -3.75, y: 1.6, z: 23 }, yaw: Math.PI, pitch: 0 };
export const ACTOR_START: Vec3 = { x: 2.15, y: 0, z: 12.4 };
export const BELL_RECEIVER: Vec3 = { x: 2.45, y: 2.9, z: 18.1 };
export const CONTAINMENT = { minX: .8, maxX: 4.3, minZ: 15.1, maxZ: 20.3 } as const;
export const CONTAINMENT_DOOR_Z = CONTAINMENT_DOOR_BOUNDS.min.z;
export const STAFF_DOOR_Z = 14;
export const DOOR_CLOSE_SECONDS = 1.4;
export const STAFF_DOOR_SECONDS = 1.2;
export const CONTROL_TARGETS = {
  key: { x: -3.55, y: 1.12, z: 12.95 },
  procedure: { x: -3.15, y: 1.12, z: 13.08 },
  bell: { x: -2.72, y: 1.18, z: 12.72 },
  isolation: { x: -2.72, y: 1.18, z: 13.18 },
  power: { x: -3.18, y: 1.55, z: 13.46 },
} as const;

const wall = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, opaque = true) =>
  ({ id, min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 3.5, z: maxZ }, kind: 'wall' as const, opaque });

/** The same door volumes drive visuals, collision and visibility. The control
 * bay's 0.7m south gap fits the player but not the actor's 0.88m body. */
export function stageWorld(doorProgress = 0, staffDoorOpened = false, actorPosition?: Vec3,
  keyInstalled = false, stopped = false, staffDoorProgress = staffDoorOpened ? 1 : 0): WorldGeometry<TargetId> {
  void keyInstalled;
  const staffBottom = 3.6 * Math.max(0, Math.min(1, staffDoorProgress));
  return { chapterId: STAGE_ID, variant: 'entrance',
    floors: [{ id: 'control-floor', minX: -5, maxX: 5, minZ: -3, maxZ: 22.2 },
      { id: 'outdoor-paving', minX: -5, maxX: 5, minZ: 22.2, maxZ: 26 }],
    solids: [
      wall('outer-west', -5.15, -5, -3, 22.25), wall('outer-east', 5, 5.15, -3, 22.25),
      wall('outer-south', -5, 5, -3.15, -3),
      wall('building-front-west', -5, -4.2, 22.1, 22.25),
      wall('building-front-east', -3.2, 5, 22.1, 22.25),
      // Two routes around the central baffle reunite before containment.
      wall('route-baffle', -.27, .27, 3.1, 8.2),
      wall('control-bay-south-west', -5, -4.1, 8, 8.18),
      wall('control-bay-south-east', -3.4, -2.35, 8, 8.18),
      wall('control-bay-window', -2.5, -2.35, 8.18, 13.9, false),
      { id: 'control-console', min: { x: -3.2, y: 0, z: 12.64 }, max: { x: -2.56, y: .99, z: 13.69 }, kind: 'wall', opaque: true },
      wall('control-bay-north-west', -5, -4.16, 13.9, 14.08),
      wall('control-bay-north-east', -3.24, -2.35, 13.9, 14.08, false),
      { id: 'staff-door', min: { x: -4.16, y: staffBottom, z: 13.9 },
        max: { x: -3.24, y: staffBottom + 3.5, z: 14.08 }, kind: 'door', opaque: true },
      // Fixed observation panes remain solid for bodies. Their non-opaque
      // world flag also lets the actor and player see through the same glass.
      wall('containment-observation-approach', -2.35, .8, CONTAINMENT_DOOR_Z, 15.18, false),
      wall('containment-east-approach', 4.3, 5, CONTAINMENT_DOOR_Z, 15.18),
      wall('containment-observation-window', .62, .8, 15.18, 20.5, false),
      wall('containment-east', 4.3, 4.48, 15.18, 20.5),
      wall('containment-north', .62, 4.48, 20.3, 20.5),
      ...containmentDoorSolids(doorProgress),
      ...(actorPosition ? [{ id: 'departure-actor-body', min: { x: actorPosition.x - ACTOR_COLLISION_RADIUS, y: 0,
        z: actorPosition.z - ACTOR_COLLISION_RADIUS }, max: { x: actorPosition.x + ACTOR_COLLISION_RADIUS,
        y: ACTOR_MODEL_BOUNDS.height, z: actorPosition.z + ACTOR_COLLISION_RADIUS }, kind: 'wall' as const, opaque: true }] : []),
    ],
    interactables: [
      { id: 'departure-key', label: '隔離キーを差す', center: CONTROL_TARGETS.key, radius: .20, maxDistance: 2.2 },
      { id: 'departure-procedure', label: '収容手順を読む', center: CONTROL_TARGETS.procedure, radius: .24, maxDistance: 2.2 },
      { id: 'departure-bell', label: '収容区画の呼び鈴を鳴らす', center: CONTROL_TARGETS.bell, radius: .22, maxDistance: 2.2 },
      { id: doorProgress > 0 && !stopped ? 'departure-reopen' : 'departure-door', label: doorProgress > 0 && !stopped ? '隔離扉を開け直す' : '隔離扉を閉じる', center: CONTROL_TARGETS.isolation, radius: .22, maxDistance: 2.5 },
      { id: 'departure-stop', label: '閉館制御を停止する', center: CONTROL_TARGETS.power, radius: .22, maxDistance: 2.5 },
      { id: 'departure-staff-door', label: '職員出口を開ける', center: { x: -3.7, y: 1.5, z: 13.42 }, radius: .30, maxDistance: 2.1 },
      { id: 'departure-outdoor', label: '屋外へ出る', center: { x: -3.75, y: 1.5, z: 23 }, radius: .4, maxDistance: 2.1 },
    ], colorPanels: [], keyFragments: [], keyFrame: { center: { x: 0, y: 0, z: 0 }, width: 0, height: 0, outline: [] } };
}

export function actorFullyContained(position: Vec3): boolean {
  return position.x - ACTOR_MODEL_BOUNDS.halfWidth >= CONTAINMENT.minX &&
    position.x + ACTOR_MODEL_BOUNDS.halfWidth <= CONTAINMENT.maxX &&
    position.z - ACTOR_MODEL_BOUNDS.halfDepth >= CONTAINMENT.minZ &&
    position.z + ACTOR_MODEL_BOUNDS.halfDepth <= CONTAINMENT.maxZ;
}
export function doorSweepClear(position: Vec3): boolean {
  return position.z - ACTOR_MODEL_BOUNDS.halfDepth > CONTAINMENT_DOOR_Z + .18 ||
    position.z + ACTOR_MODEL_BOUNDS.halfDepth < CONTAINMENT_DOOR_Z;
}
