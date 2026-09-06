import type { ChapterRuntime } from '../firstPerson/types';
import { angularDifference, contourAligned, createContourSpec, initialContour, normalizeAngle } from './contour';
import { GALLERY_SEED } from './definition';
import { initialShadow, placeShadowSample, SAMPLE_IDS, SHADOW_HIT_SLOP, SHADOW_SAMPLE_SIZE, SHADOW_SLOT_POSITIONS, shadowPairMatches, sourceSlot } from './shadow';
import type { DiscAngles, GalleryCommand, GalleryContext, GalleryEffect, GalleryProgress, GalleryTransient, Point2 } from './types';

export function initialGalleryProgress(seed = GALLERY_SEED): GalleryProgress {
  return { schemaVersion: 1, seed, shadow: initialShadow(seed), contour: initialContour(seed), order: [] };
}
export function initialGalleryTransient(progress: GalleryProgress, sessionId: string): GalleryTransient {
  return { sessionId, lastSeq: -1, lastNowMs: 0, mode: 'explore', activeDrag: null,
    contourAngles: [...progress.contour.angles], shadowCompare: false, contourGuide: false, lastCompareMs: null,
    doorDOpen: progress.shadow.solved && progress.contour.solved ? 1 : 0,
    doorShadowOpen: progress.shadow.solved ? 1 : 0, doorContourOpen: progress.contour.solved ? 1 : 0 };
}
export function cancelGalleryManipulation(runtime: ChapterRuntime, leave = false): ChapterRuntime {
  if (!runtime.gallery || !runtime.progress.gallery) return runtime;
  if (!runtime.gallery.activeDrag && (!leave || runtime.gallery.mode === 'explore')) return runtime;
  return { ...runtime, gallery: { ...runtime.gallery, activeDrag: null,
    contourAngles: [...runtime.progress.gallery.contour.angles], mode: leave ? 'explore' : runtime.gallery.mode } };
}
const finitePoint = (point: Point2): boolean => !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
const pointerValid = (pointerId: number): boolean => Number.isSafeInteger(pointerId) && pointerId >= 0;
export type GalleryCommandResult = { runtime: ChapterRuntime; accepted: boolean; reason: 'accepted' | 'stale' | 'blocked' | 'wrong-target' | 'invalid' | 'cooldown' | 'already-complete'; effects: GalleryEffect[] };
/** Host supplies a current, range/frustum/occlusion-verified panel target.
 * Event metadata is consumed even for a blocked command so it cannot replay later. */
export function applyGalleryCommand(runtime: ChapterRuntime, command: GalleryCommand, context: GalleryContext): GalleryCommandResult {
  const live = runtime.gallery, saved = runtime.progress.gallery;
  const rejected = (reason: GalleryCommandResult['reason'], state = runtime): GalleryCommandResult => ({ runtime: state, accepted: false, reason, effects: [] });
  if (!live || !saved) return rejected('blocked');
  if (command.sessionId !== live.sessionId || !Number.isSafeInteger(command.seq) || command.seq <= live.lastSeq || !Number.isFinite(command.nowMs) || command.nowMs < 0 || command.nowMs < live.lastNowMs) return rejected('stale');
  let next: ChapterRuntime = { ...runtime, gallery: { ...live, lastSeq: command.seq, lastNowMs: command.nowMs } };
  const reject = (reason: GalleryCommandResult['reason']) => rejected(reason, next);
  const accept = (effects: GalleryEffect[] = []): GalleryCommandResult => ({ runtime: next, accepted: true, reason: 'accepted', effects });
  const action = command.action;
  if (action.type === 'cancel' || action.type === 'leave') { next = cancelGalleryManipulation(next, action.type === 'leave'); return accept([{ type: 'stop-input' }]); }
  if (runtime.paused || runtime.progress.cleared || !context.foreground || !context.rendererReady || !runtime.progress.sealA) return reject('blocked');
  const patch = (part: Partial<GalleryProgress>) => { next = { ...next, progress: { ...next.progress, gallery: { ...next.progress.gallery!, ...part } } }; };
  if (action.type === 'enter') {
    if (!['shadow', 'contour'].includes(action.puzzle) || context.targetId !== action.puzzle + '-panel') return reject('wrong-target');
    next = cancelGalleryManipulation(next, true);
    next = { ...next, gallery: { ...next.gallery!, mode: action.puzzle } };
    patch(action.puzzle === 'shadow' ? { shadow: { ...saved.shadow, inspected: true } } : { contour: { ...saved.contour, inspected: true } });
    return accept([{ type: 'stop-input' }]);
  }
  const mode = next.gallery!.mode;
  if (action.type === 'compare') {
    if (context.targetId !== 'shadow-panel') return reject('wrong-target');
    if (live.lastCompareMs !== null && command.nowMs - live.lastCompareMs < 1000) return reject('cooldown');
    next = { ...next, gallery: { ...next.gallery!, shadowCompare: !live.shadowCompare, lastCompareMs: command.nowMs } }; return accept();
  }
  if (action.type === 'guide') {
    if (context.targetId !== 'contour-panel' || typeof action.enabled !== 'boolean') return reject('wrong-target');
    if (action.enabled === live.contourGuide) return accept();
    // One presentation-change clock spans both panels; switching modes does not
    // provide a way around the manual comparison/guide rate limit.
    if (live.lastCompareMs !== null && command.nowMs - live.lastCompareMs < 1000) return reject('cooldown');
    next = { ...next, gallery: { ...next.gallery!, contourGuide: action.enabled, lastCompareMs: command.nowMs } }; return accept();
  }
  if (mode === 'explore' || context.targetId !== mode + '-panel') return reject('wrong-target');
  const drag = next.gallery!.activeDrag;
  if (action.type.startsWith('shadow-')) {
    if (mode !== 'shadow') return reject('wrong-target');
    if (saved.shadow.solved) return reject('already-complete');
    if (action.type === 'shadow-start') {
      if (drag || !SAMPLE_IDS.includes(action.sampleId) || !pointerValid(action.pointerId) || !finitePoint(action.point)) return reject('invalid');
      const center = SHADOW_SLOT_POSITIONS[saved.shadow.assignments[action.sampleId]];
      const offset = { x: action.point.x - center.x, y: action.point.y - center.y };
      if (Math.abs(offset.x) > SHADOW_SAMPLE_SIZE / 2 + SHADOW_HIT_SLOP || Math.abs(offset.y) > SHADOW_SAMPLE_SIZE / 2 + SHADOW_HIT_SLOP) return reject('invalid');
      next = { ...next, gallery: { ...next.gallery!, activeDrag: { kind: 'shadow', sampleId: action.sampleId, pointerId: action.pointerId, point: { ...center }, offset } } }; return accept();
    }
    if (action.type === 'shadow-move') {
      if (drag?.kind !== 'shadow' || drag.pointerId !== action.pointerId || !finitePoint(action.point)) return reject('invalid');
      next = { ...next, gallery: { ...next.gallery!, activeDrag: { ...drag, point: { x: action.point.x - drag.offset.x, y: action.point.y - drag.offset.y } } } }; return accept();
    }
    if (action.type === 'shadow-drop') {
      if (drag?.kind !== 'shadow' || drag.pointerId !== action.pointerId) return reject('invalid');
      if (action.slotId !== null) patch({ shadow: placeShadowSample(saved.shadow, drag.sampleId, action.slotId) });
      next = { ...next, gallery: { ...next.gallery!, activeDrag: null } }; return accept([{ type: 'manipulated', puzzle: 'shadow' }]);
    }
    if (action.type === 'shadow-place' || action.type === 'shadow-return') {
      if (drag || !SAMPLE_IDS.includes(action.sampleId)) return reject('invalid');
      const updated = placeShadowSample(saved.shadow, action.sampleId, action.type === 'shadow-return' ? sourceSlot(action.sampleId) : action.slotId);
      if (updated === saved.shadow) return reject('invalid');
      patch({ shadow: updated }); return accept([{ type: 'manipulated', puzzle: 'shadow' }]);
    }
    if (action.type === 'shadow-commit') {
      if (drag || !saved.shadow.inspected) return reject('blocked');
      const correct = shadowPairMatches(saved.shadow);
      patch({ shadow: { ...saved.shadow, solved: correct, attempts: correct ? saved.shadow.attempts : Math.min(999, saved.shadow.attempts + 1) },
        order: correct && !saved.order.includes('B') ? [...saved.order, 'B'] : saved.order });
      if (correct) next = { ...next, progress: { ...next.progress, hintStage: 0 } };
      next = { ...next, gallery: { ...next.gallery!, feedback: { puzzle: 'shadow', correct, sequence: command.seq, remainingSeconds: 0.6 } } };
      return accept(correct ? [{ type: 'gallery-released', puzzle: 'shadow', sequence: command.seq }, { type: 'message', text: '二枚がつながった。回廊の封印が一つ外れた。' }] : [{ type: 'message', text: 'まだつながらない。見本を並べて確かめよう。' }]);
    }
  }
  if (mode !== 'contour') return reject('wrong-target');
  if (saved.contour.solved) return reject('already-complete');
  const spec = createContourSpec(saved.contour.seed);
  if (action.type === 'contour-start') {
    if (drag || ![0, 1, 2].includes(action.discId) || !pointerValid(action.pointerId) || !finitePoint(action.point)) return reject('invalid');
    const disc = spec.discs[action.discId]!, dx = action.point.x - disc.center.x, dy = action.point.y - disc.center.y;
    if (Math.hypot(dx, dy) < disc.radius * 0.25 || Math.hypot(dx, dy) > disc.radius * 1.2) return reject('invalid');
    next = { ...next, gallery: { ...next.gallery!, activeDrag: { kind: 'contour', discId: action.discId, pointerId: action.pointerId, lastPointerAngle: Math.atan2(dy, dx), startAngle: live.contourAngles[action.discId] } } }; return accept();
  }
  if (action.type === 'contour-move') {
    if (drag?.kind !== 'contour' || drag.pointerId !== action.pointerId || !finitePoint(action.point)) return reject('invalid');
    const disc = spec.discs[drag.discId]!, dx = action.point.x - disc.center.x, dy = action.point.y - disc.center.y;
    if (Math.hypot(dx, dy) < disc.radius * 0.25) {
      next = { ...next, gallery: { ...next.gallery!, activeDrag: { ...drag, lastPointerAngle: null } } }; return accept();
    }
    const angle = Math.atan2(dy, dx);
    if (drag.lastPointerAngle === null) {
      next = { ...next, gallery: { ...next.gallery!, activeDrag: { ...drag, lastPointerAngle: angle } } }; return accept();
    }
    const angles: DiscAngles = [...next.gallery!.contourAngles];
    angles[drag.discId] = normalizeAngle(angles[drag.discId] + normalizeAngle(angle - drag.lastPointerAngle));
    next = { ...next, gallery: { ...next.gallery!, contourAngles: angles, activeDrag: { ...drag, lastPointerAngle: angle } } }; return accept();
  }
  if (action.type === 'contour-end') {
    if (drag?.kind !== 'contour' || drag.pointerId !== action.pointerId) return reject('invalid');
    patch({ contour: { ...saved.contour, angles: [...next.gallery!.contourAngles] } });
    next = { ...next, gallery: { ...next.gallery!, activeDrag: null } }; return accept([{ type: 'manipulated', puzzle: 'contour' }]);
  }
  if (action.type === 'contour-adjust') {
    if (drag || ![0, 1, 2].includes(action.discId) || !Number.isFinite(action.delta) || Math.abs(action.delta) > Math.PI) return reject('invalid');
    const angles: DiscAngles = [...saved.contour.angles]; angles[action.discId] = normalizeAngle(angles[action.discId] + action.delta);
    patch({ contour: { ...saved.contour, angles } }); next = { ...next, gallery: { ...next.gallery!, contourAngles: [...angles] } }; return accept([{ type: 'manipulated', puzzle: 'contour' }]);
  }
  if (action.type === 'contour-commit') {
    if (drag || !saved.contour.inspected) return reject('blocked');
    // The displayed live transforms, persisted angles and decision must agree.
    const same = live.contourAngles.every((angle, index) => angularDifference(angle, saved.contour.angles[index]!) < 1e-10);
    const correct = same && contourAligned(saved.contour.seed, live.contourAngles);
    patch({ contour: { ...saved.contour, solved: correct, attempts: correct ? saved.contour.attempts : Math.min(999, saved.contour.attempts + 1) },
      order: correct && !saved.order.includes('C') ? [...saved.order, 'C'] : saved.order });
    if (correct) next = { ...next, progress: { ...next.progress, hintStage: 0 } };
    next = { ...next, gallery: { ...next.gallery!, feedback: { puzzle: 'contour', correct, sequence: command.seq, remainingSeconds: 0.6 } } };
    return accept(correct ? [{ type: 'gallery-released', puzzle: 'contour', sequence: command.seq }, { type: 'message', text: '引き出しが開いた。回廊の封印が外れた。' }] : [{ type: 'message', text: '円盤の切り欠きを、中央へ向けてみよう。' }]);
  }
  return reject('invalid');
}
export function advanceGallery(runtime: ChapterRuntime, elapsed: number): ChapterRuntime {
  const saved = runtime.progress.gallery, live = runtime.gallery;
  if (!saved || !live) return runtime;
  const remaining = live.feedback ? Math.max(0, live.feedback.remainingSeconds - elapsed) : 0;
  return { ...runtime, gallery: { ...live,
    doorDOpen: saved.shadow.solved && saved.contour.solved ? Math.min(1, live.doorDOpen + elapsed / 1.25) : 0,
    doorShadowOpen: saved.shadow.solved ? Math.min(1, live.doorShadowOpen + elapsed / 0.7) : 0,
    doorContourOpen: saved.contour.solved ? Math.min(1, live.doorContourOpen + elapsed / 0.7) : 0,
    feedback: live.feedback && remaining > 0 ? { ...live.feedback, remainingSeconds: remaining } : undefined } };
}
