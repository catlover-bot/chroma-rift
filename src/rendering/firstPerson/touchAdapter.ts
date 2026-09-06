import { beginLook, beginStick, observeReleaseBarrier, clearTouchInput, endPointer, moveLook, moveStick, targetChangedTouches, validPointer, type FirstPersonInput, type PointerId } from './touchInput';

export type TouchMode = 'stick' | 'look';
export type TouchPhase = 'start' | 'move' | 'end' | 'cancel';
export type TouchPoint = { identifier: PointerId; pageX: number; pageY: number };
export type NativeTouchBatch = { changedTouches?: readonly TouchPoint[]; targetTouches?: readonly TouchPoint[]; touches?: readonly TouchPoint[] };

/** JS-only adapter for the installed RN 0.86 native touch emitter.
 * RCTSurfaceTouchHandler owns each touch's original emitter for its lifetime.
 * TouchEventEmitter.cpp exposes globally batched changedTouches; the primary
 * event fields may belong to a sibling. pageX/Y are stable root coordinates.
 * No renderer/controller reference is sent through a UI-thread worklet. */
export function createTouchAdapter(input: FirstPersonInput, enabled = true, sessionKey = '') {
  let active = enabled;
  let generation = 0;
  return {
    sessionKey,
    isCurrent: () => active,
    bind(mode: TouchMode, phase: TouchPhase) {
      const token = generation;
      return (event: NativeTouchBatch): void => {
        if (!active || token !== generation) return;
        const changed = Array.isArray(event.changedTouches) ? event.changedTouches.filter((point) => point && validPointer(point.identifier)) : [];
        if (input.releaseBarrier.length) {
          if (Array.isArray(event.touches)) observeReleaseBarrier(input, event.touches.filter(point => point && validPointer(point.identifier)).map(point => point.identifier));
          else if (phase === 'start') observeReleaseBarrier(input, [...input.releaseBarrier, ...changed.map(point => point.identifier)]);
          if (phase === 'end' || phase === 'cancel') for (const point of changed) endPointer(input, point.identifier);
          // Even the event which clears the barrier must not contribute input.
          return;
        }
        const owner = mode === 'stick' ? input.stickPointer : input.lookPointer;
        if (phase === 'end' || phase === 'cancel') {
          // End/cancel may have empty targetTouches: ended pointers are not an
          // active-touch list. Only this region's authoritative owner can stop.
          const ending = changed.find((point) => point.identifier === owner);
          if (owner !== null && (ending || (phase === 'cancel' && changed.length === 0))) {
            // The ending event can contain a final point never sent as a move.
            // Apply that requested displacement once; release adds no velocity.
            if (phase === 'end' && mode === 'look' && ending) moveLook(input, owner, ending.pageX, ending.pageY);
            endPointer(input, owner, phase === 'cancel');
          }
          return;
        }
        if (phase === 'start') {
          const target = Array.isArray(event.targetTouches) ? event.targetTouches.filter((point) => point && validPointer(point.identifier)) : undefined;
          for (const point of targetChangedTouches(changed, target)) {
            if (!validPointer(point.identifier)) continue;
            (mode === 'stick' ? beginStick : beginLook)(input, point.identifier, point.pageX, point.pageY);
          }
          return;
        }
        const point = changed.find((candidate) => candidate.identifier === owner);
        if (point) (mode === 'stick' ? moveStick : moveLook)(input, point.identifier, point.pageX, point.pageY);
      };
    },
    dispose() {
      active = false;
      generation += 1;
      clearTouchInput(input);
    },
  };
}
