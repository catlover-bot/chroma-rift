import type { PlayerPose, Vec3, WorldGeometry } from '../../firstPerson/types';
import { ACTOR_COLLISION_RADIUS, ACTOR_MODEL_BOUNDS } from '../../actorMotion/envelope';

export const STAGE_ID = 'mirror-corridor-v1' as const;
export const STAGE_TITLE = '鏡越しの回廊';
export type TargetId = 'mirror-corridor-figure' | 'mirror-corridor-key' | 'mirror-corridor-practice' | 'mirror-corridor-winch' | 'mirror-corridor-exit';
export const SPAWN: PlayerPose = { position: { x: 0, y: 1.6, z: -2.5 }, yaw: Math.PI, pitch: 0 };
export const KEY_SAFE: PlayerPose = { position: { x: 0, y: 1.6, z: 2.5 }, yaw: Math.PI, pitch: 0 };
export const WINCH_SAFE: PlayerPose = { position: { x: -1.8, y: 1.6, z: 10 }, yaw: Math.PI, pitch: 0 };
export const POST_GATE: PlayerPose = { position: { x: 0, y: 1.6, z: 19 }, yaw: Math.PI, pitch: 0 };
export const EXIT: PlayerPose = { position: { x: 0, y: 1.6, z: 22.5 }, yaw: Math.PI, pitch: 0 };
export const FIGURE_CENTER = { x: 0, y: 1.95, z: 0.4 } as const;
export const KEY_CENTER = { x: 0, y: 1.35, z: 0.43 } as const;
export const PRACTICE_CENTER = { x: -2.45, y: 1.4, z: 7.5 } as const;
export const WINCH_CENTER = { x: -2.45, y: 1.4, z: 11.3 } as const;
// Beside the winch, in the same forward view while its hold pointer owns look.
// The east-facing plane reflects the north corridor behind that work surface.
export const MIRROR_CENTER = { x: -2.65, y: 1.9, z: 11.4 } as const;
export const GATE_Z = 17.2;
export const RATCHET_SECONDS = 2;
export const RATCHET_COUNT = 3;
export const grateY = (ratchets: number) => ratchets === RATCHET_COUNT ? 3.6 : ratchets * 0.9;

const wall = (id: string, minX: number, maxX: number, minZ: number, maxZ: number) =>
  ({ id, min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 3.5, z: maxZ }, kind: 'wall' as const, opaque: true });

/** One gate volume supplies the visible grate, collision and sight occlusion. */
export function stageWorld(ratchets: number, keyTaken = false, practiced = false, holding: 'practice' | 'winch' | null = null,
  actorPosition?: Vec3): WorldGeometry<TargetId> {
  const gateY = grateY(ratchets);
  return { chapterId: STAGE_ID, variant: 'entrance',
    floors: [{ id: 'main-corridor', minX: -3, maxX: 3, minZ: -3, maxZ: 24 },
      { id: 'short-shelter', minX: -4.7, maxX: -3, minZ: 9.4, maxZ: 12.7 }],
    solids: [wall('west-entry', -3.15, -3, -3, 9.4), wall('west-after-shelter', -3.15, -3, 12.7, 24),
      wall('west-shelter', -4.85, -4.7, 9.4, 12.7), wall('shelter-south', -4.7, -3, 9.25, 9.4),
      wall('shelter-north', -4.7, -3, 12.7, 12.85),
      // Both ends remain passable; the central rack physically blocks a direct
      // line into the recess rather than granting a hidden safe-state flag.
      wall('shelter-rack', -3.4, -2.8, 10.35, 11.75), wall('east', 3, 3.15, -3, 24),
      wall('gate-west', -3, -1.08, GATE_Z, GATE_Z + 0.18), wall('gate-east', 1.08, 3, GATE_Z, GATE_Z + 0.18),
      { id: 'isolation-grate', min: { x: -1.08, y: gateY, z: GATE_Z }, max: { x: 1.08, y: gateY + 3.5, z: GATE_Z + 0.18 }, kind: 'door', opaque: true },
      ...(actorPosition ? [{ id: 'mirror-actor-body', min: { x: actorPosition.x - ACTOR_COLLISION_RADIUS, y: 0, z: actorPosition.z - ACTOR_COLLISION_RADIUS },
        max: { x: actorPosition.x + ACTOR_COLLISION_RADIUS, y: ACTOR_MODEL_BOUNDS.height, z: actorPosition.z + ACTOR_COLLISION_RADIUS },
        kind: 'wall' as const, opaque: true }] : [])],
    interactables: [
      { id: 'mirror-corridor-figure', label: '向き合う横顔を調べる', center: FIGURE_CENTER, radius: 0.42, maxDistance: 2.5 },
      ...(!keyTaken ? [{ id: 'mirror-corridor-key' as const, label: '隔離キーを取る', center: KEY_CENTER, radius: 0.16, maxDistance: 2.2 }] : []),
      ...(!practiced || holding === 'practice' ? [{ id: 'mirror-corridor-practice' as const, label: '練習レバーを保持する', center: PRACTICE_CENTER, radius: 0.25, maxDistance: 2.2 }] : []),
      ...(ratchets < RATCHET_COUNT || holding === 'winch' ? [{ id: 'mirror-corridor-winch' as const, label: '巻き上げレバーを保持する', center: WINCH_CENTER, radius: 0.3, maxDistance: 2.3 }] : []),
      { id: 'mirror-corridor-exit', label: '制御室への前室へ進む', center: { x: 0, y: 1.5, z: 23 }, radius: 0.4, maxDistance: 2.2 },
    ], colorPanels: [], keyFragments: [], keyFrame: { center: { x: 0, y: 0, z: 0 }, width: 0, height: 0, outline: [] } };
}
