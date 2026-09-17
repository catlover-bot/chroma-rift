import type { CollisionVolume, PlayerPose, Vec3, WorldGeometry } from '../../firstPerson/types';
import { ACTOR_COLLISION_RADIUS, ACTOR_MODEL_BOUNDS } from '../../actorMotion/envelope';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../../firstPerson/constants';

export const STAGE_ID = 'mirror-corridor-v1' as const;
export const STAGE_TITLE = '鏡越しの回廊';
export type TargetId = 'mirror-corridor-figure' | 'mirror-corridor-key' | 'mirror-corridor-mirror' | 'mirror-corridor-practice' | 'mirror-corridor-winch' | 'mirror-corridor-exit';
export const SPAWN: PlayerPose = { position: { x: 0, y: 1.6, z: -2.5 }, yaw: Math.PI, pitch: 0 };
export const KEY_SAFE: PlayerPose = { position: { x: 0, y: 1.6, z: 2.5 }, yaw: Math.PI, pitch: 0 };
export const WINCH_SAFE: PlayerPose = { position: { x: -1.8, y: 1.6, z: 10 }, yaw: Math.PI, pitch: 0 };
// The historic work checkpoint remains readable. New work checkpoints use the
// actual shelf recess, facing its southern opening rather than the machinery.
export const LEGACY_SHELTER_SAFE: PlayerPose = { position: { x: -4.05, y: 1.6, z: 10.7 }, yaw: 0, pitch: 0 };
export const SHELTER_SAFE: PlayerPose = { ...LEGACY_SHELTER_SAFE,
  position: { ...LEGACY_SHELTER_SAFE.position }, yaw: Math.atan2(-.95, .85) };
export const POST_GATE: PlayerPose = { position: { x: 0, y: 1.6, z: 19 }, yaw: Math.PI, pitch: 0 };
export const LEGACY_EXIT: PlayerPose = { position: { x: 0, y: 1.6, z: 22.5 }, yaw: Math.PI, pitch: 0 };
export const FIGURE_CENTER = { x: -.5, y: 1.6, z: 0.4 } as const;
export const KEY_CENTER = { x: 0, y: 1.6, z: 0.43 } as const;
export const PRACTICE_CENTER = { x: -2.45, y: 1.4, z: 7.5 } as const;
export const WINCH_CENTER = { x: -2.45, y: 1.4, z: 11.3 } as const;
// Beside the winch, in the same forward view while its hold pointer owns look.
// The east-facing plane reflects the north corridor behind that work surface.
export const MIRROR_CENTER = { x: -2.65, y: 1.9, z: 11.4 } as const;
export const MIRROR_YAW = 1.32;
export const MIRROR_SIZE = { width: 1.12, height: 1.12 } as const;
export const MIRROR_RECTANGLE = {
  width: MIRROR_SIZE.width - .08, height: MIRROR_SIZE.height - .08,
  normal: { x: Math.sin(MIRROR_YAW), y: 0, z: Math.cos(MIRROR_YAW) },
  right: { x: Math.cos(MIRROR_YAW), y: 0, z: -Math.sin(MIRROR_YAW) },
} as const;
export const GATE_Z = 17.2;
/** Authored physical layout, also consumed by the scene. The exit has supported
 * floor beyond its visible threshold; no separate invisible action target. */
export const MIRROR_LAYOUT = {
  corridor: { minX: -3, maxX: 3, minZ: -3, maxZ: 24 },
  vestibule: { minX: -3, maxX: 3, minZ: 24, maxZ: 32.2 },
  shelterRack: { minX: -3.4, maxX: -2.8, minZ: 10.15, maxZ: 11.95 },
  doorway: { z: 31.38, thresholdZ: 31.5, halfWidth: .75, height: 3.2, depth: .16 },
  gate: { z: GATE_Z, halfWidth: 1.08, depth: .18, height: 3.5, guideTop: 7.2, pulleyY: 7.3,
    barWidth: .065, barCount: 9, railHeight: .08 },
} as const;
export const EXIT: PlayerPose = { position: { x: 0, y: 1.6, z: MIRROR_LAYOUT.doorway.thresholdZ + .2 }, yaw: Math.PI, pitch: 0 };
export const RATCHET_SECONDS = 2;
export const RATCHET_COUNT = 3;
export const grateY = (ratchets: number) => ratchets === RATCHET_COUNT ? 3.6 : ratchets * 0.9;
export const gatePassable = (gateLift: number) => Number.isFinite(gateLift) && gateLift >= PLAYER_HEIGHT;
export const gateCrossedBy = (pose: PlayerPose, gateLift: number) => gatePassable(gateLift) &&
  Math.abs(pose.position.x) <= MIRROR_LAYOUT.gate.halfWidth - PLAYER_RADIUS &&
  pose.position.z >= GATE_Z + MIRROR_LAYOUT.gate.depth + PLAYER_RADIUS;
export function mirrorRecoveryPose(progress: { keyTaken: boolean; practiced: boolean; ratchets: number; gateCrossed: boolean; cleared: boolean }): PlayerPose {
  const safe = progress.cleared ? EXIT : progress.gateCrossed && progress.ratchets === RATCHET_COUNT ? POST_GATE
    : progress.practiced || progress.ratchets > 0 ? SHELTER_SAFE : progress.keyTaken ? KEY_SAFE : SPAWN;
  return { ...safe, position: { ...safe.position } };
}

/** Thin visible steel supplies LOS; the enclosing non-opaque slab below
 * supplies body collision. Gaps therefore show the actual space behind them. */
export function gateParts(gateLift: number): CollisionVolume[] {
  const gate = MIRROR_LAYOUT.gate, inset = gate.barWidth / 2;
  const part = (id: string, minX: number, maxX: number, low: number, high: number): CollisionVolume => ({
    id, min: { x: minX, y: gateLift + low, z: GATE_Z },
    max: { x: maxX, y: gateLift + high, z: GATE_Z + gate.depth }, kind: 'door', opaque: true,
  });
  return [
    ...Array.from({ length: gate.barCount }, (_, index) => {
      const x = -gate.halfWidth + inset + index * (2 * (gate.halfWidth - inset)) / (gate.barCount - 1);
      return part(`isolation-grate-bar-${index}`, x - inset, x + inset, 0, gate.height);
    }),
    ...[gate.railHeight / 2, 1.1, 2.2, gate.height - gate.railHeight / 2].map((y, index) =>
      part(`isolation-grate-rail-${index}`, -gate.halfWidth, gate.halfWidth, y - gate.railHeight / 2, y + gate.railHeight / 2)),
  ];
}

const wall = (id: string, minX: number, maxX: number, minZ: number, maxZ: number) =>
  ({ id, min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 3.5, z: maxZ }, kind: 'wall' as const, opaque: true });

/** Shared floors, static solids, visible grate bars and circular actor body. */
export function stageWorld(ratchets: number, keyTaken = false, practiced = false, holding: 'practice' | 'winch' | null = null,
  actorPosition?: Vec3, gateLift = grateY(ratchets)): WorldGeometry<TargetId> {
  const gateY = gateLift;
  return { chapterId: STAGE_ID, variant: 'entrance',
    floors: [{ id: 'main-corridor', ...MIRROR_LAYOUT.corridor },
      { id: 'control-vestibule-floor', ...MIRROR_LAYOUT.vestibule },
      { id: 'short-shelter', minX: -4.7, maxX: -3, minZ: 9.4, maxZ: 12.7 }],
    solids: [wall('west-entry', -3.15, -3, -3, 9.4), wall('west-after-shelter', -3.15, -3, 12.7, MIRROR_LAYOUT.vestibule.maxZ),
      wall('practice-screen', -1.6, -1.45, 6.5, 8.35),
      wall('practice-north', -3, -1.45, 8.35, 8.5),
      wall('practice-south-left', -3, -2.55, 6.35, 6.5),
      wall('practice-south-right', -1.84, -1.45, 6.35, 6.5),
      wall('west-shelter', -4.85, -4.7, 9.4, 12.7), wall('shelter-south', -4.7, -3, 9.25, 9.4),
      wall('shelter-north', -4.7, -3, 12.7, 12.85),
      { id:'practice-bench-core',min:{x:-2.85,y:.74,z:7.175},max:{x:-2.37,y:.89,z:7.825},kind:'wall',opaque:true },
      { id:'winch-core',min:{x:-2.85,y:.05,z:10.975},max:{x:-2.37,y:1.33,z:11.625},kind:'wall',opaque:true },
      // Both .75m end openings admit the .48m player, but not the .88m actor.
      // The same visible rack blocks sight; there is no hidden safe-state flag.
      wall('shelter-rack', MIRROR_LAYOUT.shelterRack.minX, MIRROR_LAYOUT.shelterRack.maxX,
        MIRROR_LAYOUT.shelterRack.minZ, MIRROR_LAYOUT.shelterRack.maxZ), wall('east', 3, 3.15, -3, MIRROR_LAYOUT.vestibule.maxZ),
      wall('gate-west', -3, -MIRROR_LAYOUT.gate.halfWidth, GATE_Z, GATE_Z + MIRROR_LAYOUT.gate.depth),
      wall('gate-east', MIRROR_LAYOUT.gate.halfWidth, 3, GATE_Z, GATE_Z + MIRROR_LAYOUT.gate.depth),
      { id: 'isolation-grate', min: { x: -MIRROR_LAYOUT.gate.halfWidth, y: gateY, z: GATE_Z },
        max: { x: MIRROR_LAYOUT.gate.halfWidth, y: gateY + MIRROR_LAYOUT.gate.height, z: GATE_Z + MIRROR_LAYOUT.gate.depth }, kind: 'door', opaque: false },
      ...gateParts(gateY),
      wall('control-vestibule-end-west', -3, -MIRROR_LAYOUT.doorway.halfWidth, MIRROR_LAYOUT.doorway.z, MIRROR_LAYOUT.doorway.z + MIRROR_LAYOUT.doorway.depth),
      wall('control-vestibule-end-east', MIRROR_LAYOUT.doorway.halfWidth, 3, MIRROR_LAYOUT.doorway.z, MIRROR_LAYOUT.doorway.z + MIRROR_LAYOUT.doorway.depth),
      { id: 'control-vestibule-door-head', min: { x: -MIRROR_LAYOUT.doorway.halfWidth, y: MIRROR_LAYOUT.doorway.height, z: MIRROR_LAYOUT.doorway.z },
        max: { x: MIRROR_LAYOUT.doorway.halfWidth, y: 3.5, z: MIRROR_LAYOUT.doorway.z + MIRROR_LAYOUT.doorway.depth }, kind: 'wall', opaque: true },
      ...(actorPosition ? [{ id: 'mirror-actor-body', min: { x: actorPosition.x - ACTOR_COLLISION_RADIUS, y: 0, z: actorPosition.z - ACTOR_COLLISION_RADIUS },
        max: { x: actorPosition.x + ACTOR_COLLISION_RADIUS, y: ACTOR_MODEL_BOUNDS.height, z: actorPosition.z + ACTOR_COLLISION_RADIUS },
        kind: 'wall' as const, opaque: true, dynamicBody: { radius: ACTOR_COLLISION_RADIUS } }] : [])],
    interactables: [
      { id: 'mirror-corridor-figure', label: '向き合う横顔を調べる', center: FIGURE_CENTER, radius: 0.42, maxDistance: 2.5 },
      ...(!keyTaken ? [{ id: 'mirror-corridor-key' as const, label: '隔離キーを取る', center: KEY_CENTER, radius: 0.16, maxDistance: 2.2 }] : []),
      { id: 'mirror-corridor-mirror', label: '背後を映す鏡を調べる', center: MIRROR_CENTER, radius: 0.56,
        maxDistance: 2.3, rectangle: MIRROR_RECTANGLE },
      ...(!practiced || holding === 'practice' ? [{ id: 'mirror-corridor-practice' as const, label: '練習レバーを保持する', center: PRACTICE_CENTER, radius: 0.25, maxDistance: 2.2 }] : []),
      ...(ratchets < RATCHET_COUNT || holding === 'winch' ? [{ id: 'mirror-corridor-winch' as const, label: '巻き上げレバーを保持する', center: WINCH_CENTER, radius: 0.3, maxDistance: 2.3 }] : []),
    ], colorPanels: [], keyFragments: [], keyFrame: { center: { x: 0, y: 0, z: 0 }, width: 0, height: 0, outline: [] } };
}
