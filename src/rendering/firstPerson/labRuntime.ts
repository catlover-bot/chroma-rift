import type { ChapterRuntime, WorldGeometry } from '../../domain/firstPerson/types';

/** Small retained native smoke-test room, separate from saved chapter progress. */
export function getLabWorld(runtime: ChapterRuntime): WorldGeometry {
  const wall = (id: string, x: number, z: number, width: number, depth: number) => ({ id, kind: 'wall' as const, opaque: true, min: { x, y: 0, z }, max: { x: x + width, y: 3.2, z: z + depth } });
  return {
    variant: 'entrance',
    floors: [{ id: 'lab-room', minX: -3, maxX: 3, minZ: -5, maxZ: 4 }],
    solids: [wall('lab-west', -3.1, -5, 0.2, 9), wall('lab-east', 2.9, -5, 0.2, 9), wall('lab-back', -3, 3.9, 6, 0.2), wall('lab-far', -3, -5.1, 6, 0.2), wall('lab-front-left', -3, -3.1, 2, 0.2), wall('lab-front-right', 1, -3.1, 2, 0.2),
      { id: 'seal-a-door', kind: 'door', opaque: true, min: { x: -1, y: runtime.doorAOpen * 3.3, z: -3.1 }, max: { x: 1, y: 3.2 + runtime.doorAOpen * 3.3, z: -2.9 } }],
    interactables: [{ id: 'guide', label: runtime.progress.sealA ? '開いた検証扉' : '検証扉を開く', center: { x: 0, y: 1.6, z: -2.82 }, radius: 0.4, maxDistance: 2.2 }],
    colorPanels: [{ id: 'lab-palette', minX: -1.8, maxX: 1.8, minZ: -1.8, maxZ: 1.8 }],
    keyFragments: [], keyFrame: { center: { x: 0, y: 0, z: 0 }, width: 0, height: 0, outline: [] },
  };
}
