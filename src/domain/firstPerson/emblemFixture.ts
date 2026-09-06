import type { Glyph } from '../emblem';
import type { CollisionVolume, Vec3 } from './types';
import { createPanelFixture, panelFixtureSolid } from './panelFixture';

/** North-right wall: x=1..3, front z=-7.9. The center is visible from the
 * entrance corridor; the entire opening x=-1..1 remains unobstructed. */
export const EMBLEM_FIXTURE = createPanelFixture({
  center: { x: 1.95, y: 1.83, z: -7.81 },
  width: 1.65, height: 1.65, maxDistance: 2.4,
  normal: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 },
  frameWidth: 1.82, frameHeight: 1.82,
});
export const EMBLEM_SWITCHES = [
  { glyph: 'circle', id: 'emblem-circle', center: { x: 1.37, y: 0.64, z: -7.745 }, width: 0.34, height: 0.34, maxDistance: 2.3 },
  { glyph: 'diamond', id: 'emblem-diamond', center: { x: 1.95, y: 0.64, z: -7.745 }, width: 0.34, height: 0.34, maxDistance: 2.3 },
  { glyph: 'square', id: 'emblem-square', center: { x: 2.53, y: 0.64, z: -7.745 }, width: 0.34, height: 0.34, maxDistance: 2.3 },
] as const satisfies readonly { glyph: Glyph; id: string; center: Vec3; width: number; height: number; maxDistance: number }[];
export const EMBLEM_SWITCH_TRAVEL = 0.035;
export const EMBLEM_SWITCH_FEEDBACK_SECONDS = 0.35;
export const EMBLEM_LATCH = { center: { x: 1.2, y: 0.925, z: -7.75 }, width: 0.3, height: 0.06, depth: 0.07, travel: 0.12 } as const;
export const EMBLEM_FIXTURE_SOLIDS: readonly CollisionVolume[] = [
  panelFixtureSolid('emblem-panel-body', EMBLEM_FIXTURE),
  ...EMBLEM_SWITCHES.map((item): CollisionVolume => ({
    id: item.id + '-body', min: { x: item.center.x - 0.21, y: 0.43, z: -7.9 },
    max: { x: item.center.x + 0.21, y: 0.85, z: -7.745 }, kind: 'device', opaque: true,
  })),
  { id: 'emblem-latch-body', min: { x: 1.02, y: 0.89, z: -7.9 }, max: { x: 1.55, y: 0.96, z: -7.70 }, kind: 'device', opaque: true },
];
