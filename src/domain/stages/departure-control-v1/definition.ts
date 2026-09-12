import { ACTOR_COLLISION_RADIUS, ACTOR_MODEL_BOUNDS } from '../../actorMotion/envelope';
import type { PlayerPose, Vec3, WorldGeometry } from '../../firstPerson/types';

export const STAGE_ID = 'departure-control-v1' as const;
export const STAGE_TITLE = '退館制御室';
export type TargetId = 'departure-key' | 'departure-procedure' | 'departure-bell' | 'departure-door' |
  'departure-reopen' | 'departure-stop' | 'departure-staff-door' | 'departure-outdoor';
export const SPAWN: PlayerPose = { position: { x: -3.75, y: 1.6, z: 10 }, yaw: Math.PI, pitch: 0 };
export const CONTROL_SAFE: PlayerPose = { position: { ...SPAWN.position }, yaw: SPAWN.yaw, pitch: SPAWN.pitch };
export const STAFF_EXIT_SAFE: PlayerPose = { position: { x: -3.75, y: 1.6, z: 17.2 }, yaw: Math.PI, pitch: 0 };
export const OUTDOOR: PlayerPose = { position: { x: -3.75, y: 1.6, z: 23 }, yaw: Math.PI, pitch: 0 };
export const ACTOR_START: Vec3 = { x: 2.15, y: 0, z: 12.4 };
export const BELL_RECEIVER: Vec3 = { x: 2.45, y: 2.9, z: 18.1 };
export const CONTAINMENT = { minX: .8, maxX: 4.3, minZ: 15.1, maxZ: 20.3 } as const;
export const CONTAINMENT_DOOR_Z = 15;
export const STAFF_DOOR_Z = 14;
export const DOOR_CLOSE_SECONDS = 1.4;

const wall = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, opaque = true) =>
  ({ id, min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 3.5, z: maxZ }, kind: 'wall' as const, opaque });

/** The same door volumes drive visuals, collision and visibility. The control
 * bay's 0.7m south gap fits the player but not the actor's 0.88m body. */
export function stageWorld(doorProgress = 0, staffDoorOpened = false, actorPosition?: Vec3,
  keyInstalled = false, stopped = false): WorldGeometry<TargetId> {
  const closed = Math.max(0, Math.min(1, doorProgress));
  const containmentBottom = 3.5 * (1 - closed);
  const staffBottom = staffDoorOpened ? 3.6 : 0;
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
      wall('control-bay-north-west', -5, -4.16, 13.9, 14.08),
      wall('control-bay-north-east', -3.24, -2.35, 13.9, 14.08),
      { id: 'staff-door', min: { x: -4.16, y: staffBottom, z: 13.9 },
        max: { x: -3.24, y: staffBottom + 3.5, z: 14.08 }, kind: 'door', opaque: true },
      // Fixed observation panes remain solid for bodies. Their non-opaque
      // world flag also lets the actor and player see through the same glass.
      wall('containment-observation-approach', -2.35, .8, CONTAINMENT_DOOR_Z, 15.18, false),
      wall('containment-east-approach', 4.3, 5, CONTAINMENT_DOOR_Z, 15.18),
      wall('containment-observation-window', .62, .8, 15.18, 20.5, false),
      wall('containment-east', 4.3, 4.48, 15.18, 20.5),
      wall('containment-north', .62, 4.48, 20.3, 20.5),
      { id: 'containment-door', min: { x: .8, y: containmentBottom, z: CONTAINMENT_DOOR_Z },
        max: { x: 4.3, y: containmentBottom + 3.5, z: 15.18 }, kind: 'door', opaque: true },
      ...(actorPosition ? [{ id: 'departure-actor-body', min: { x: actorPosition.x - ACTOR_COLLISION_RADIUS, y: 0,
        z: actorPosition.z - ACTOR_COLLISION_RADIUS }, max: { x: actorPosition.x + ACTOR_COLLISION_RADIUS,
        y: ACTOR_MODEL_BOUNDS.height, z: actorPosition.z + ACTOR_COLLISION_RADIUS }, kind: 'wall' as const, opaque: true }] : []),
    ],
    interactables: [
      ...(!keyInstalled ? [{ id: 'departure-key' as const, label: '隔離キーを差す', center: { x: -4.75, y: 1.4, z: 9 }, radius: .25, maxDistance: 2.2 }] : []),
      { id: 'departure-procedure', label: '点検手順を読む', center: { x: -4.75, y: 1.4, z: 10 }, radius: .32, maxDistance: 2.2 },
      ...(!stopped ? [{ id: 'departure-bell' as const, label: '収容区画の呼び鈴を鳴らす', center: { x: -4.75, y: 1.4, z: 11 }, radius: .3, maxDistance: 2.2 }] : []),
      ...(!stopped && doorProgress === 0 ? [{ id: 'departure-door' as const, label: '隔離扉を閉じる', center: { x: -4.75, y: 1.4, z: 12 }, radius: .3, maxDistance: 2.5 }] : []),
      ...(!stopped && doorProgress > 0 ? [{ id: 'departure-reopen' as const, label: '隔離扉を開け直す', center: { x: -4.75, y: 1.4, z: 12 }, radius: .3, maxDistance: 2.5 }] : []),
      ...(!stopped ? [{ id: 'departure-stop' as const, label: '閉館制御を停止する', center: { x: -4.75, y: 1.4, z: 13 }, radius: .3, maxDistance: 2.5 }] : []),
      ...(!staffDoorOpened ? [{ id: 'departure-staff-door' as const, label: '職員出口を開ける', center: { x: -3.7, y: 1.5, z: 13.42 }, radius: .35, maxDistance: 2.1 }] : []),
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
