import { useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { controlLayout, type ControlLayout } from './controlLayout';
import { createTouchAdapter, type NativeTouchBatch, type TouchMode, type TouchPhase } from './touchAdapter';
import { clearTouchInput, STICK_DIAMETER, type FirstPersonInput } from './touchInput';

export type TouchControlsProps = { input: FirstPersonInput; enabled: boolean; handedness: 'left' | 'right'; layout?: ControlLayout; showMovementLabel?: boolean };
export function TouchControls({ input, enabled, handedness, layout: suppliedLayout, showMovementLabel = true }: TouchControlsProps) {
  const window = useWindowDimensions();
  const layout = suppliedLayout ?? controlLayout(window.width, window.height, window.fontScale, handedness);
  const movement = layout.movement;
  const sceneView = useRef<View>(null);
  const sceneOrigin = useRef<{ x: number; y: number } | null>(null);
  const sessionKey = JSON.stringify([handedness, layout]);
  const adapter = useMemo(() => createTouchAdapter(input, enabled, sessionKey), [enabled, input, sessionKey]);
  const anchorX = useSharedValue(movement.width / 2);
  const anchorY = useSharedValue(movement.height - STICK_DIAMETER / 2 - 8);
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ translateX: anchorX.value - STICK_DIAMETER / 2 }, { translateY: anchorY.value - STICK_DIAMETER / 2 }] }));
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knobX.value }, { translateY: knobY.value }] }));
  useLayoutEffect(() => {
    clearTouchInput(input);
    sceneOrigin.current = null;
    sceneView.current?.measureInWindow((x, y) => {
      if (adapter.isCurrent() && Number.isFinite(x) && Number.isFinite(y)) sceneOrigin.current = { x, y };
    });
    return () => adapter.dispose();
  }, [adapter, input]);
  useLayoutEffect(() => {
    anchorX.set(movement.width / 2);
    anchorY.set(Math.max(STICK_DIAMETER / 2, movement.height - STICK_DIAMETER / 2 - 8));
    knobX.set(0);
    knobY.set(0);
  }, [adapter, anchorX, anchorY, knobX, knobY, movement.height, movement.width]);
  const syncVisual = () => {
    if (input.stickPointer === null) {
      anchorX.set(movement.width / 2);
      anchorY.set(Math.max(STICK_DIAMETER / 2, movement.height - STICK_DIAMETER / 2 - 8));
    } else if (sceneOrigin.current) {
      const radius = STICK_DIAMETER / 2;
      // Clamp only the displayed ring. Its logical origin remains touch-down,
      // so a start near the scene edge never produces an initial velocity.
      anchorX.set(Math.max(radius, Math.min(movement.width - radius, input.stickOriginX - sceneOrigin.current.x - movement.left)));
      anchorY.set(Math.max(radius, Math.min(movement.height - radius, input.stickOriginY - sceneOrigin.current.y - movement.top)));
    }
    knobX.set(input.stickOffsetX);
    knobY.set(input.stickOffsetY);
  };
  const touch = (event: GestureResponderEvent, mode: TouchMode, phase: TouchPhase) => {
    adapter.bind(mode, phase)(event.nativeEvent as unknown as NativeTouchBatch);
    if (adapter.isCurrent()) syncVisual();
  };
  return (
    <View ref={sceneView} pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="touch-controls"
      onLayout={() => sceneView.current?.measureInWindow((x, y) => { if (adapter.isCurrent() && Number.isFinite(x) && Number.isFinite(y)) sceneOrigin.current = { x, y }; })}>
      <View testID="look-region" accessible={false} pointerEvents={enabled ? 'auto' : 'none'}
        style={[styles.zone, layout.look]}
        onTouchStart={(event) => touch(event, 'look', 'start')} onTouchMove={(event) => touch(event, 'look', 'move')}
        onTouchEnd={(event) => touch(event, 'look', 'end')} onTouchCancel={(event) => touch(event, 'look', 'cancel')} />
      <View testID="movement-stick" accessible={false} pointerEvents={enabled ? 'auto' : 'none'}
        style={[styles.zone, movement]}
        onTouchStart={(event) => touch(event, 'stick', 'start')} onTouchMove={(event) => touch(event, 'stick', 'move')}
        onTouchEnd={(event) => touch(event, 'stick', 'end')} onTouchCancel={(event) => touch(event, 'stick', 'cancel')}>
        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]}>
          <Text pointerEvents="none" style={styles.arrow}>↑</Text>
          <Animated.View pointerEvents="none" style={[styles.knob, knobStyle]} />
          {showMovementLabel ? <Text pointerEvents="none" style={styles.stickLabel}>歩く</Text> : null}
        </Animated.View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  zone: { position: 'absolute' },
  ring: { position: 'absolute', left: 0, top: 0, width: STICK_DIAMETER, height: STICK_DIAMETER, borderRadius: STICK_DIAMETER / 2, borderColor: '#D8E0D16E', borderWidth: 1, backgroundColor: '#15202838', alignItems: 'center', justifyContent: 'center' },
  arrow: { position: 'absolute', top: 4, color: '#E1E6DDB8', fontSize: 20 },
  knob: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#D9E0D37A', borderWidth: 1, borderColor: '#EDF0E980' },
  stickLabel: { position: 'absolute', bottom: 7, color: '#E5E8E0B8', fontSize: 12 },
});
