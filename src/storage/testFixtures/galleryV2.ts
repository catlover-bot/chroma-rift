import { originalV1 } from './galleryV1';

/** Explicit historical Goal007 schema. No current parser/default/round-trip is
 * used to construct the migration input. */
export function originalV2(stage: 'initial' | 'B' | 'C' | 'BC' | 'connected' | 'ending' | 'cleared') {
  const old = originalV1(stage === 'initial' ? 'initial' : stage === 'connected' || stage === 'ending' ? 'D' : stage);
  const p = old.progress, connected = ['connected', 'ending', 'cleared'].includes(stage);
  return { ...old, levelVersion: 2, pose: stage === 'ending' ? { position: { x: 4, y: 1.6, z: 17 }, yaw: Math.PI, pitch: 0 } : old.pose,
    progress: { ...p, gallery: { ...p.gallery, schemaVersion: 2,
      emergencyLit: stage !== 'initial', exitInspected: stage !== 'initial',
      powerTaken: { shadow: p.gallery.shadow.solved, contour: p.gallery.contour.solved }, powerConnected: connected, completedFromV1: false,
      story: { foreshadowed: stage !== 'initial', absence: stage !== 'initial', serviceWarned: connected, resolved: stage === 'cleared' } } } };
}
