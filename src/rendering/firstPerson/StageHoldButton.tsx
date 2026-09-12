import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps } from 'react-native';

import { targetChangedTouches, validPointer, type PointerId } from './touchInput';
import type { NativeTouchBatch, TouchPhase } from './touchAdapter';

/** A long press owns only the contact that began on this button. Fabric may
 * include sibling fingers in changedTouches, so start filters by targetTouches
 * and end matches the acquired identifier. */
export function createStageHoldTouchAdapter(enabled = true, sessionKey: string | number = '') {
  let active = enabled;
  let owner: PointerId | null = null;
  let nativeTouchesSeen = false;
  return {
    sessionKey,
    isCurrent: () => active,
    hasNativeTouches: () => nativeTouchesSeen,
    handle(phase: TouchPhase, event: NativeTouchBatch, begin: (id: PointerId) => boolean, end: (id: PointerId) => void): void {
      if (!active) return;
      nativeTouchesSeen = true;
      const changed = Array.isArray(event.changedTouches) ? event.changedTouches.filter(point => point && validPointer(point.identifier)) : [];
      if (phase === 'start') {
        if (owner !== null) return;
        const target = Array.isArray(event.targetTouches) ? event.targetTouches.filter(point => point && validPointer(point.identifier)) : undefined;
        const point = targetChangedTouches(changed, target).find(touch => Number.isFinite(touch.pageX) && Number.isFinite(touch.pageY));
        if (point && begin(point.identifier)) owner = point.identifier;
        return;
      }
      if (owner === null || phase === 'move') return;
      const ending = changed.some(point => point.identifier === owner) || phase === 'cancel' && changed.length === 0;
      if (ending && (phase === 'end' || phase === 'cancel')) {
        const id = owner;
        owner = null;
        end(id);
      }
    },
    dispose(): void { active = false; owner = null; },
  };
}

export type StageHoldButtonProps = {
  label: string;
  holding: boolean;
  disabled?: boolean;
  testID?: string;
  sessionKey?: string | number;
  style?: PressableProps['style'];
  children?: ReactNode;
  onBegin: (pointerId?: PointerId) => boolean;
  onEnd: (pointerId?: PointerId) => void;
};

export function StageHoldButton({ label, holding, disabled = false, testID, sessionKey = '', style, children, onBegin, onEnd }: StageHoldButtonProps) {
  const adapter = useMemo(() => createStageHoldTouchAdapter(!disabled, sessionKey), [disabled, sessionKey]);
  useLayoutEffect(() => () => adapter.dispose(), [adapter]);
  const touch = (phase: TouchPhase, event: GestureResponderEvent) => adapter.handle(phase, event.nativeEvent as unknown as NativeTouchBatch, onBegin, onEnd);
  const activate = () => {
    if (!adapter.isCurrent()) return;
    if (holding) onEnd();
    else onBegin();
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="押すと保持を始め、もう一度押すと放します。" accessibilityState={{ disabled }}
    disabled={disabled} testID={testID} style={style}
    onTouchStart={event => touch('start', event)} onTouchMove={event => touch('move', event)}
    onTouchEnd={event => touch('end', event)} onTouchCancel={event => touch('cancel', event)}
    onPress={event => {
      const native = event?.nativeEvent;
      const nativeTouch = native && ('changedTouches' in native || 'touches' in native);
      if (!nativeTouch || !adapter.hasNativeTouches()) activate();
    }}>{children}</Pressable>;
}
