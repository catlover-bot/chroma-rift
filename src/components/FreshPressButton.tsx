import { useLayoutEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, type GestureResponderEvent } from 'react-native';
import { createActionTouchAdapter } from '../rendering/firstPerson/SceneActionButton';
import type { NativeTouchBatch, TouchPhase } from '../rendering/firstPerson/touchAdapter';
import { UI_COLORS } from '../theme/ui';

function createFreshPressOwner(sessionKey: string) {
  let current = createActionTouchAdapter(false, sessionKey);
  return { activate: () => { current = createActionTouchAdapter(true, sessionKey); },
    dispose: () => current.dispose(), isCurrent: () => current.isCurrent(),
    handle: (phase: TouchPhase, event: NativeTouchBatch) => current.handle(phase, event) };
}

/** A result must own a new down/up pair. An inherited release or Pressability
 * onPress from the preceding scene is never a navigation command. Assistive
 * activation has its own explicit native accessibility event path. */
export function FreshPressButton({ label, onPress, variant = 'secondary', sessionKey }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary'; sessionKey: string;
}) {
  const owner = useMemo(() => createFreshPressOwner(sessionKey), [sessionKey]);
  useLayoutEffect(() => { owner.activate(); return () => owner.dispose(); }, [owner]);
  const touch = (phase: TouchPhase, event: GestureResponderEvent) => {
    if (owner.handle(phase, event.nativeEvent as unknown as NativeTouchBatch)) onPress();
  };
  const activate = () => { if (owner.isCurrent()) onPress(); };
  return <Pressable onPress={() => { /* Touch navigation is owned by start/end above. */ }} accessibilityRole="button" accessibilityLabel={label}
    accessibilityActions={[{ name: 'activate', label }]} onAccessibilityTap={activate}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') activate(); }}
    onTouchStart={event => touch('start', event)} onTouchMove={event => touch('move', event)}
    onTouchEnd={event => touch('end', event)} onTouchCancel={event => touch('cancel', event)}
    style={({ pressed }) => [styles.button, variant === 'primary' && styles.primary, pressed && styles.pressed]}>
    <Text style={styles.text}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48,
    paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: 12,
    borderColor: UI_COLORS.border, backgroundColor: UI_COLORS.panelRaised },
  primary: { backgroundColor: '#34343E', borderColor: UI_COLORS.focus }, pressed: { opacity: .72 },
  text: { color: UI_COLORS.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
