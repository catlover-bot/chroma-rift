import type { PanelSurface } from '../firstPerson/panelFixture';
import type { Vec3 } from '../firstPerson/types';
import type { ActionInstance, ActionState } from '../stageKit/actionInstance';
import { initialActionState } from '../stageKit/actionInstance';

export type TheatreBellId = 'theatre-bell-a' | 'theatre-bell-b';
export const THEATRE_BELLS: readonly (ActionInstance & { instanceId: TheatreBellId; fixture: PanelSurface; receiver: Vec3; label: string; number: 1 | 2 })[] = [
  { instanceId: 'theatre-bell-a', kind: 'bell', number: 1, label: '奥の呼び鈴を鳴らす', cooldownSeconds: 8,
    fixture: { center: { x: -3.94, y: 1.35, z: 7.3 }, width: .46, height: .50, normal: { x: 1, y: 0, z: 0 }, right: { x: 0, y: 0, z: -1 }, maxDistance: 2.6 },
    receiver: { x: 2.8, y: 2.68, z: 10.1 }, input: { move: true, look: true, pointer: 'none', dangerAdvances: true, end: 'release' } },
  { instanceId: 'theatre-bell-b', kind: 'bell', number: 2, label: '手前の呼び鈴を鳴らす', cooldownSeconds: 8,
    fixture: { center: { x: 3.94, y: 1.35, z: 14.6 }, width: .46, height: .50, normal: { x: -1, y: 0, z: 0 }, right: { x: 0, y: 0, z: 1 }, maxDistance: 2.6 },
    receiver: { x: -2.8, y: 2.68, z: 16.1 }, input: { move: true, look: true, pointer: 'none', dangerAdvances: true, end: 'release' } },
];
export const THEATRE_SHUTTER: ActionInstance & { instanceId: 'theatre-manual-shutter'; z: number; minX: number; maxX: number; height: number; duration: number; handles: readonly PanelSurface[] } = {
  instanceId: 'theatre-manual-shutter', kind: 'shutter', cooldownSeconds: 0, z: 11.8, minX: -4, maxX: -1.1, height: 3.35, duration: .9,
  handles: [
    { center: { x: -3.46, y: 1.35, z: 11.62 }, width: .5, height: .66, normal: { x: 0, y: 0, z: -1 }, right: { x: -1, y: 0, z: 0 }, maxDistance: 2.4 },
    { center: { x: -3.46, y: 1.35, z: 11.98 }, width: .5, height: .66, normal: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, maxDistance: 2.4 },
  ], input: { move: true, look: true, pointer: 'none', dangerAdvances: true, end: 'release' },
};
export type TheatreEnvironment = { bells: Record<TheatreBellId, ActionState>; shutter: { closed: boolean; progress: number } };
export function initialTheatreEnvironment(): TheatreEnvironment {
  return { bells: { 'theatre-bell-a': initialActionState(), 'theatre-bell-b': initialActionState() }, shutter: { closed: false, progress: 0 } };
}
