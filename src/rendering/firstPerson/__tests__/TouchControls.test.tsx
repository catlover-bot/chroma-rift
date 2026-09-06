import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import * as THREE from 'three';

import { inspectPoseSafety, MOVE_SPEED } from '../../../domain/firstPerson/geometry';
import { TouchControls } from '../TouchControls';
import { controlLayout } from '../controlLayout';
import { advanceController, createController, worldForController } from '../runtimeController';
import { createTouchAdapter, type NativeTouchBatch } from '../touchAdapter';
import { consumeLook, createTouchInput, requireAllPointersReleased } from '../touchInput';

const layout = controlLayout(390, 763);
const point = (identifier: number, pageX: number, pageY: number, locationX = 1, locationY = 1) => ({ identifier, pageX, pageY, locationX, locationY });
const event = (...changedTouches: ReturnType<typeof point>[]) => ({ nativeEvent: { changedTouches } });
const camera = () => new THREE.PerspectiveCamera(65, 390 / 763, 0.08, 60);

describe('actual RN touch component and native-batch adapter (GPU excluded)', () => {
  it('uses page coordinates despite moving child-local coordinates and floats from touch-down', async () => {
    const input = createTouchInput();
    const view = await render(<TouchControls input={input} enabled handedness="right" layout={layout} />);
    const stick = view.getByTestId('movement-stick');
    const look = view.getByTestId('look-region');
    await fireEvent(stick, 'touchStart', event(point(1, 30, 600, 90, 5)));
    expect(input.forward).toBe(0);
    await fireEvent(stick, 'touchMove', event(point(1, 30, 550, 1, 80)));
    expect(input.forward).toBe(1);
    await fireEvent(look, 'touchStart', event(point(2, 320, 300, 100, 100)));
    await fireEvent(look, 'touchMove', event(point(2, 350, 315, 1, 5)));
    expect(consumeLook(input)).toEqual({ x: 30, y: 15 });
    await fireEvent(stick, 'touchMove', event(point(1, 450, 400)));
    await fireEvent(look, 'touchMove', event(point(2, 30, 315)));
    expect(input.stickPointer).toBe(1);
    expect(input.lookPointer).toBe(2);
    expect(consumeLook(input)).toEqual({ x: -320, y: 0 });
    expect(view.getByText('歩く').props.pointerEvents).toBe('none');
    expect(view.getByTestId('touch-controls').props.pointerEvents).toBe('box-none');
  });
  it('routes global Fabric batches only to their starting emitter and releases with empty targetTouches', async () => {
    const input = createTouchInput();
    const view = await render(<TouchControls input={input} enabled handedness="right" layout={layout} />);
    const stick = view.getByTestId('movement-stick');
    const look = view.getByTestId('look-region');
    const move = point(1, 40, 600);
    const rotate = point(2, 300, 400);
    const third = point(3, 320, 720);
    const changedTouches = [third, rotate, move];
    // Primary event fields deliberately identify the unrelated action pointer.
    await fireEvent(look, 'touchStart', { nativeEvent: { ...third, changedTouches, targetTouches: [rotate] } });
    await fireEvent(stick, 'touchStart', { nativeEvent: { ...third, changedTouches, targetTouches: [move] } });
    expect(input.stickPointer).toBe(1);
    expect(input.lookPointer).toBe(2);
    const moved = [point(1, 40, 550), point(2, 330, 410)];
    await fireEvent(stick, 'touchMove', { nativeEvent: { changedTouches: moved, targetTouches: [moved[0]] } });
    await fireEvent(look, 'touchMove', { nativeEvent: { changedTouches: moved, targetTouches: [moved[1]] } });
    expect(input.forward).toBe(1);
    expect(input.lookX).toBe(30);
    await fireEvent(look, 'touchEnd', { nativeEvent: { changedTouches: [moved[1]], targetTouches: [], touches: [moved[0]] } });
    expect(input.lookPointer).toBeNull();
    expect(input.forward).toBe(1);
    expect(consumeLook(input)).toEqual({ x: 30, y: 10 });
    expect(consumeLook(input)).toEqual({ x: 0, y: 0 });
    await fireEvent(stick, 'touchEnd', { nativeEvent: { changedTouches: [moved[0]], targetTouches: [], touches: [] } });
    expect(input.forward).toBe(0);
  });
  it('cancels one owner independently including an empty active collection', async () => {
    const input = createTouchInput();
    const view = await render(<TouchControls input={input} enabled handedness="right" layout={layout} />);
    await fireEvent(view.getByTestId('movement-stick'), 'touchStart', event(point(1, 40, 600)));
    await fireEvent(view.getByTestId('movement-stick'), 'touchMove', event(point(1, 40, 550)));
    await fireEvent(view.getByTestId('look-region'), 'touchStart', event(point(2, 300, 400)));
    await fireEvent(view.getByTestId('look-region'), 'touchMove', event(point(2, 330, 400)));
    await fireEvent(view.getByTestId('movement-stick'), 'touchCancel', { nativeEvent: { changedTouches: [point(1, 40, 550)], targetTouches: [], touches: [] } });
    expect(input.forward).toBe(0);
    expect(input.lookPointer).toBe(2);
    expect(input.lookX).toBe(30);
    await fireEvent(view.getByTestId('look-region'), 'touchCancel', { nativeEvent: { changedTouches: [], targetTouches: [] } });
    expect(input.lookPointer).toBeNull();
    expect(input.lookX).toBe(0);
  });
  it('keeps HUD buttons as sibling targets and cannot adopt their batched third pointer', async () => {
    const input = createTouchInput();
    const press = jest.fn();
    const view = await render(<View>
      <TouchControls input={input} enabled handedness="right" layout={layout} />
      <Pressable testID="action" onPress={press} style={layout.action}><Text>調べる</Text></Pressable>
      <Pressable testID="pause" onPress={press} style={layout.pause}><Text>休止</Text></Pressable>
    </View>);
    const look = view.getByTestId('look-region');
    const buttonTouch = point(3, layout.action.left + 10, layout.action.top + 10);
    await fireEvent(look, 'touchStart', { nativeEvent: { changedTouches: [buttonTouch], targetTouches: [] } });
    expect(input.lookPointer).toBeNull();
    await fireEvent.press(view.getByTestId('action'));
    expect(press).toHaveBeenCalledTimes(1);
    expect(input).toEqual(createTouchInput());
    await fireEvent(look, 'touchStart', event(point(2, 300, 300)));
    await fireEvent(look, 'touchMove', event(point(2, buttonTouch.pageX, buttonTouch.pageY)));
    await fireEvent(look, 'touchEnd', { nativeEvent: { changedTouches: [point(2, buttonTouch.pageX, buttonTouch.pageY)], targetTouches: [] } });
    expect(press).toHaveBeenCalledTimes(1);
    expect(input.lookPointer).toBeNull();
    // RN keeps the original emitter through release. This exercises our actual
    // release handler; physical-device Pressability arbitration remains a trial.
  });
  it.each(['disable', 'handedness', 'layout', 'session', 'unmount'] as const)('invalidates old callbacks on %s and requires fresh ownership', async (change) => {
    const input = createTouchInput();
    const next = createTouchInput();
    const view = await render(<TouchControls input={input} enabled handedness="right" layout={layout} />);
    const oldStart = view.getByTestId('movement-stick').props.onTouchStart;
    const oldMove = view.getByTestId('movement-stick').props.onTouchMove;
    await fireEvent(view.getByTestId('movement-stick'), 'touchStart', event(point(1, 40, 600)));
    await fireEvent(view.getByTestId('movement-stick'), 'touchMove', event(point(1, 40, 550)));
    expect(input.forward).toBe(1);
    if (change === 'unmount') await view.unmount();
    else await view.rerender(<TouchControls input={change === 'session' ? next : input} enabled={change !== 'disable'} handedness={change === 'handedness' ? 'left' : 'right'} layout={change === 'layout' ? controlLayout(320, 548) : layout} />);
    expect(input.forward).toBe(0);
    expect(input.lookX).toBe(0);
    await act(() => { oldStart(event(point(9, 50, 600))); oldMove(event(point(9, 50, 540))); });
    expect(input.stickPointer).toBeNull();
    expect(input.forward).toBe(0);
    if (change === 'disable') {
      await view.rerender(<TouchControls input={input} enabled handedness="right" layout={layout} />);
      await fireEvent(view.getByTestId('movement-stick'), 'touchMove', event(point(1, 40, 500)));
      expect(input.forward).toBe(0);
      await fireEvent(view.getByTestId('movement-stick'), 'touchStart', event(point(7, 40, 600)));
      await fireEvent(view.getByTestId('movement-stick'), 'touchMove', event(point(7, 40, 550)));
      expect(input.forward).toBe(1);
    }
  });
  it('preserves a held pointer across semantic React rerenders with equal layout values', async () => {
    const input = createTouchInput();
    const view = await render(<TouchControls input={input} enabled handedness="right" layout={layout} />);
    await fireEvent(view.getByTestId('movement-stick'), 'touchStart', event(point(1, 40, 600)));
    await fireEvent(view.getByTestId('movement-stick'), 'touchMove', event(point(1, 40, 570)));
    const forward = input.forward;
    await view.rerender(<TouchControls input={input} enabled handedness="right" layout={{ ...layout }} />);
    expect(input.forward).toBe(forward);
    expect(input.stickPointer).toBe(1);
  });
  it('rejects nonfinite native point data without trusting child-local fallbacks', () => {
    const input = createTouchInput();
    const adapter = createTouchAdapter(input);
    const start = adapter.bind('stick', 'start');
    start({ changedTouches: [{ identifier: 1, locationX: 50, locationY: 50 }] } as unknown as NativeTouchBatch);
    expect(input.stickPointer).toBeNull();
    start({ changedTouches: [point(1, 30, 300)] });
    adapter.bind('stick', 'move')({ changedTouches: [point(1, NaN, 280)] });
    expect(input.stickPointer).toBeNull();
    adapter.dispose();
    start({ changedTouches: [point(7, 30, 300)] });
    expect(input.stickPointer).toBeNull();
  });
  it('applies one look delta once while analog walking continues at simulated 30/60/120 Hz', () => {
    const results = [30, 60, 120].map((hz) => {
      const controller = createController(undefined, true);
      const adapter = createTouchAdapter(controller.input);
      const apply = (mode: 'stick' | 'look', phase: 'start' | 'move', value: ReturnType<typeof point>) => adapter.bind(mode, phase)({ changedTouches: [value] });
      apply('stick', 'start', point(1, 40, 600));
      apply('stick', 'move', point(1, 40, 550));
      apply('look', 'start', point(2, 300, 300));
      apply('look', 'move', point(2, 360, 320));
      const view = camera();
      for (let frame = 0; frame < hz; frame += 1) advanceController(controller, 1 / hz, view);
      expect(controller.runtime.pose.yaw).toBeCloseTo(-0.18);
      expect(controller.runtime.pose.pitch).toBeCloseTo(-0.06);
      expect(controller.input.lookX).toBe(0);
      expect(Math.hypot(controller.runtime.pose.position.x, controller.runtime.pose.position.z - 2.6)).toBeCloseTo(MOVE_SPEED);
      return controller.runtime.pose;
    });
    results.slice(1).forEach((result) => {
      expect(result.position.x).toBeCloseTo(results[0]!.position.x, 8);
      expect(result.position.z).toBeCloseTo(results[0]!.position.z, 8);
      expect(result.yaw).toBeCloseTo(results[0]!.yaw, 8);
    });
  });
  it('retains a quick released drag including its final native point exactly once at every simulated frame rate', () => {
    for (const hz of [30, 60, 120]) {
      const controller = createController(undefined, true);
      const adapter = createTouchAdapter(controller.input);
      const view = camera();
      const events = [
        { at: 0.001, phase: 'start' as const, point: point(2, 300, 300) },
        { at: 0.009, phase: 'move' as const, point: point(2, 310, 302) },
        { at: 0.014, phase: 'end' as const, point: point(2, 330, 310) },
      ];
      let next = 0;
      for (let frame = 1; frame <= hz; frame += 1) {
        while (next < events.length && events[next]!.at <= frame / hz) {
          const event = events[next++]!;
          adapter.bind('look', event.phase)({ changedTouches: [event.point], ...(event.phase === 'end' ? { targetTouches: [] } : {}) });
        }
        advanceController(controller, 1 / hz, view);
      }
      expect(controller.input.lookPointer).toBeNull();
      expect(controller.runtime.pose.yaw).toBeCloseTo(-0.09, 8);
      expect(controller.runtime.pose.pitch).toBeCloseTo(-0.03, 8);
      expect(consumeLook(controller.input)).toEqual({ x: 0, y: 0 });
    }
  });
  it('uses the analog dead zone once so a small deliberate displacement still walks slowly', () => {
    const controller = createController(undefined, true);
    const adapter = createTouchAdapter(controller.input);
    adapter.bind('stick', 'start')({ changedTouches: [point(1, 40, 600)] });
    adapter.bind('stick', 'move')({ changedTouches: [point(1, 40, 590)] });
    const amount = controller.input.forward;
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThan(0.14);
    for (let frame = 0; frame < 30; frame += 1) advanceController(controller, 1 / 60, camera());
    expect(2.6 - controller.runtime.pose.position.z).toBeCloseTo(MOVE_SPEED * 0.5 * amount, 8);
  });
  it('keeps walls and the closed door solid during sustained diagonal analog input', () => {
    const controller = createController(undefined, true);
    const adapter = createTouchAdapter(controller.input);
    adapter.bind('stick', 'start')({ changedTouches: [point(1, 40, 600)] });
    adapter.bind('stick', 'move')({ changedTouches: [point(1, 40, 550)] });
    const view = camera();
    for (let frame = 0; frame < 240; frame += 1) advanceController(controller, 1 / 60, view);
    expect(controller.runtime.pose.position.z).toBeGreaterThan(-2.67);
    expect(controller.runtime.progress.sealA).toBe(false);
    adapter.bind('stick', 'move')({ changedTouches: [point(1, 100, 540)] });
    for (let frame = 0; frame < 400; frame += 1) {
      advanceController(controller, 1 / 60, view);
      expect(inspectPoseSafety(controller.runtime.pose, worldForController(controller)).intersectingSolidIds).toEqual([]);
    }
    expect(controller.runtime.progress.sealA).toBe(false);
  });
});

it('native global touch endings release contact recovery even after ownership was cleared', () => {
  const input = createTouchInput(), adapter = createTouchAdapter(input);
  const a = point(1, 30, 400), b = point(2, 250, 150), c = point(3, 45, 400);
  adapter.bind('stick', 'start')({ changedTouches: [a], targetTouches: [a] });
  adapter.bind('look', 'start')({ changedTouches: [b], targetTouches: [b] });
  requireAllPointersReleased(input);
  adapter.bind('stick', 'start')({ changedTouches: [c], targetTouches: [c], touches: [a, b, c] });
  expect(input.releaseBarrier).toEqual([1, 2, 3]);
  adapter.bind('look', 'end')({ changedTouches: [b], targetTouches: [], touches: [a, c] });
  adapter.bind('stick', 'end')({ changedTouches: [a], targetTouches: [c], touches: [c] });
  expect(input.releaseBarrier).toEqual([3]);
  adapter.bind('stick', 'move')({ changedTouches: [point(3, 45, 340)], touches: [c] });
  expect(input.forward).toBe(0);
  adapter.bind('stick', 'end')({ changedTouches: [c], touches: [] });
  expect(input.releaseBarrier).toEqual([]);
  adapter.bind('stick', 'start')({ changedTouches: [a], touches: [a] });
  adapter.bind('stick', 'move')({ changedTouches: [point(1, 30, 350)] });
  expect(input.forward).toBe(1);
});
