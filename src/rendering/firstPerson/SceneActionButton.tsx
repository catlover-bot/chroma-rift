import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps } from 'react-native';

import { type NativeTouchBatch, type TouchPhase } from './touchAdapter';
import { targetChangedTouches, validPointer, type PointerId } from './touchInput';

export const ACTION_TOUCH_SLOP = 14;

/** Pressability 0.86 reads global touches[0] for its moving responder. During
 * two-thumb play that may be another thumb, cancelling a third-finger press.
 * Keep a button's native touch owner independent of that responder heuristic. */
export function createActionTouchAdapter(enabled = true, sessionKey: string | number = '') {
  let active = enabled;
  let owner: PointerId | null = null;
  let originX = 0;
  let originY = 0;
  let cancelled = false;
  let nativeTouchesSeen = false;
  return {
    sessionKey,
    isCurrent: () => active,
    hasNativeTouches: () => nativeTouchesSeen,
    handle(phase: TouchPhase, event: NativeTouchBatch): boolean {
      if (!active) return false;
      nativeTouchesSeen = true;
      const changed = Array.isArray(event.changedTouches) ? event.changedTouches.filter((point) => point && validPointer(point.identifier)) : [];
      if (phase === 'start') {
        if (owner !== null) return false;
        const target = Array.isArray(event.targetTouches) ? event.targetTouches.filter((point) => point && validPointer(point.identifier)) : undefined;
        const point = targetChangedTouches(changed, target).find((touch) => Number.isFinite(touch.pageX) && Number.isFinite(touch.pageY));
        if (point) { owner = point.identifier; originX = point.pageX; originY = point.pageY; cancelled = false; }
        return false;
      }
      const point = changed.find((touch) => touch.identifier === owner);
      if (phase === 'cancel') {
        if (point || changed.length === 0) { owner = null; cancelled = true; }
        return false;
      }
      if (!point || owner === null) return false;
      if (!Number.isFinite(point.pageX) || !Number.isFinite(point.pageY) || Math.hypot(point.pageX - originX, point.pageY - originY) > ACTION_TOUCH_SLOP) cancelled = true;
      if (phase === 'end') {
        owner = null;
        return !cancelled;
      }
      return false;
    },
    dispose() { active = false; owner = null; cancelled = true; },
  };
}

export type SceneActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string | undefined;
  style?: PressableProps['style'];
  children?: ReactNode;
  sessionKey?: string | number | undefined;
};
export function SceneActionButton({ label, onPress, disabled = false, testID, style, children, sessionKey = '' }: SceneActionButtonProps) {
  const adapter = useMemo(() => createActionTouchAdapter(!disabled, sessionKey), [disabled, sessionKey]);
  useLayoutEffect(() => () => adapter.dispose(), [adapter]);
  const touch = (phase: TouchPhase, event: GestureResponderEvent) => {
    if (adapter.handle(phase, event.nativeEvent as unknown as NativeTouchBatch)) onPress();
  };
  const activate = () => { if (adapter.isCurrent()) onPress(); };
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    testID={testID} style={style}
    accessibilityActions={[{ name: 'activate', label }]} onAccessibilityTap={activate}
    onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'activate') activate(); }}
    onTouchStart={(event) => touch('start', event)} onTouchMove={(event) => touch('move', event)}
    onTouchEnd={(event) => touch('end', event)} onTouchCancel={(event) => touch('cancel', event)}
    onPress={(event) => {
      // Non-touch activation includes VoiceOver, keyboard and programmatic UI
      // tests. Native touch presses were handled once by their original owner.
      const native = event?.nativeEvent;
      const nativeTouch = native && (('changedTouches' in native) || ('touches' in native));
      if (!nativeTouch || !adapter.hasNativeTouches()) activate();
    }}>{children}</Pressable>;
}
