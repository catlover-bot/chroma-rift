import { createCheckpoint, createInitialRuntime } from '../../domain/firstPerson';
import { createContourSpec, createShadowSpec, initialContour, initialShadow, normalizeAngle, placeShadowSample } from '../../domain/gallery';

type V1Stage = 'initial' | 'A' | 'B' | 'C' | 'BC' | 'D' | 'return' | 'cleared';
// Explicit Goal006 document shape. A v2 checkpoint is never used as migration input.
export function originalV1(stage: V1Stage) {
  const host = createInitialRuntime(), seed = 73;
  host.progress.sealA = stage !== 'initial';
  host.progress.sealB = ['D', 'return', 'cleared'].includes(stage);
  host.progress.variant = ['return', 'cleared'].includes(stage) ? 'exit' : 'entrance';
  host.progress.exitDoorOpen = stage === 'cleared'; host.progress.cleared = stage === 'cleared';
  let shadow = initialShadow(seed), contour = initialContour(seed);
  const bSolved = ['B', 'BC', 'D', 'return', 'cleared'].includes(stage), cSolved = ['C', 'BC', 'D', 'return', 'cleared'].includes(stage);
  if (bSolved) {
    const pair = createShadowSpec(seed).samples.filter(sample => sample.color === '#808080');
    shadow = placeShadowSample(shadow, pair[0]!.id, 'socket-left'); shadow = placeShadowSample(shadow, pair[1]!.id, 'socket-right');
    shadow = { ...shadow, inspected: true, solved: true, attempts: 2 };
  }
  if (cSolved) contour = { ...contour, inspected: true, solved: true, attempts: 3, angles: createContourSpec(seed).discs.map(disc => normalizeAngle(disc.targetAngle)) as [number, number, number] };
  return { schemaVersion: 1, chapterId: 'perception-gallery-v1', levelVersion: 1,
    pose: { position: { x: 0, y: 1.6, z: stage === 'cleared' ? 15.5 : 7 }, yaw: 0, pitch: 0 },
    progress: { ...createCheckpoint(host).progress, gallery: { schemaVersion: 1, seed, shadow, contour, order: [...(bSolved ? ['B'] : []), ...(cSolved ? ['C'] : [])] } } };
}
