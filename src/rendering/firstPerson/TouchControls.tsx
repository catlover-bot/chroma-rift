import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type NativeTouchEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { beginLook, beginStick, clearTouchInput, endPointer, moveLook, moveStick, targetChangedTouches, type FirstPersonInput, type InputRegion } from './touchInput';

export function TouchControls({ input, enabled, handedness }: { input: FirstPersonInput; enabled: boolean; handedness: 'left' | 'right' }) {
  const joystickRegion = { width: 124, height: 124 };
  const lookRegion = useRef<InputRegion>({ width: 1, height: 1 });
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knobX.value }, { translateY: knobY.value }] }));
  const syncKnob = () => { knobX.set(input.right * 34); knobY.set(-input.forward * 34); };
  useEffect(() => {
    if (!enabled) { clearTouchInput(input); knobX.set(0); knobY.set(0); }
  }, [enabled, input, knobX, knobY]);
  const touch = (event: GestureResponderEvent, mode: 'stick' | 'look', phase: 'start' | 'move' | 'end') => {
    if (!enabled) return;
    // RN 0.86 Fabric supplies targetTouches (TouchEventEmitter.cpp), although
    // NativeTouchEvent's TS declaration omits it. Its primary fields can belong
    // to another sibling because changedTouches is a global native batch.
    const nativeEvent = event.nativeEvent as NativeTouchEvent & { targetTouches?: NativeTouchEvent[] };
    for (const point of targetChangedTouches(nativeEvent.changedTouches, nativeEvent.targetTouches)) {
      if (phase === 'end') endPointer(input, point.identifier);
      else if (mode === 'stick') (phase === 'start' ? beginStick : moveStick)(input, point.identifier, point.locationX, point.locationY, joystickRegion);
      else (phase === 'start' ? beginLook : moveLook)(input, point.identifier, point.locationX, point.locationY, lookRegion.current);
    }
    syncKnob();
  };
  const cancel = () => { clearTouchInput(input); syncKnob(); };
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View testID="look-region" accessible={false} pointerEvents={enabled ? 'auto' : 'none'}
        style={[styles.look, handedness === 'right' ? styles.lookRight : styles.lookLeft]}
        onLayout={(event) => { lookRegion.current = event.nativeEvent.layout; }}
        onTouchStart={(event) => touch(event, 'look', 'start')} onTouchMove={(event) => touch(event, 'look', 'move')} onTouchEnd={(event) => touch(event, 'look', 'end')} onTouchCancel={cancel}>
        <Text pointerEvents="none" style={styles.lookLabel}>ドラッグで見回す</Text>
      </View>
      <View testID="movement-stick" accessible={false} pointerEvents={enabled ? 'auto' : 'none'}
        style={[styles.stick, handedness === 'right' ? styles.stickLeft : styles.stickRight]}
        onTouchStart={(event) => touch(event, 'stick', 'start')} onTouchMove={(event) => touch(event, 'stick', 'move')} onTouchEnd={(event) => touch(event, 'stick', 'end')} onTouchCancel={cancel}>
        <Text pointerEvents="none" style={styles.arrow}>↑</Text>
        <Animated.View pointerEvents="none" style={[styles.knob, knobStyle]} />
        <Text pointerEvents="none" style={styles.stickLabel}>歩く</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  look: { position: 'absolute', top: 90, bottom: 80, width: '48%', justifyContent: 'flex-end', paddingBottom: 125, alignItems: 'center' },
  lookRight: { right: 0 }, lookLeft: { left: 0 },
  lookLabel: { color: '#E4E6DE', backgroundColor: '#252C30A8', borderRadius: 8, padding: 8, fontSize: 12 },
  stick: { position: 'absolute', bottom: 92, width: 124, height: 124, borderRadius: 62, borderColor: '#D8E0D18C', borderWidth: 1.5, backgroundColor: '#1520286E', alignItems: 'center', justifyContent: 'center' },
  stickLeft: { left: 22 }, stickRight: { right: 22 },
  arrow: { position: 'absolute', top: 5, color: '#E1E6DD', fontSize: 24 },
  knob: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#D9E0D3B8', borderWidth: 1, borderColor: '#EDF0E9' },
  stickLabel: { position: 'absolute', bottom: 8, color: '#E5E8E0', fontSize: 14 },
});
