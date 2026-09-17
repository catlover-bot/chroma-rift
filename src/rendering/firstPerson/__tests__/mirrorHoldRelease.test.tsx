import { act, fireEvent, render } from '@testing-library/react-native';
import * as THREE from 'three';

import { isSafePose } from '../../../domain/firstPerson/geometry';
import { isStageSession } from '../../../domain/stages/mirror-corridor-v1/session';
import { StageHoldButton } from '../StageHoldButton';
import { TouchControls } from '../TouchControls';
import { controlLayout } from '../controlLayout';
import { advanceController, beginStageHoldController, controllerSnapshot, createController,
  endStageHoldController, syncCamera, worldForController } from '../runtimeController';

const point = (identifier: number, pageX: number, pageY: number) => ({ identifier, pageX, pageY });
const event = (...changedTouches: ReturnType<typeof point>[]) => ({ nativeEvent: { changedTouches } });

/** Fault-isolated input fixture, not evidence of a successful campaign route. */
function atLegalWinch(ratchets = 0) {
  const controller = createController(undefined, false, true, 'mirror-corridor-v1');
  const camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false, renderReturns: 1, presentationReturns: 1 });
  controller.runtime.pose = { position: { x: -2.45, y: 1.6, z: 9.6 }, yaw: Math.PI, pitch: -.12 };
  const handle = controller.runtime.stageSession!;
  if (!isStageSession(handle.value)) throw new Error('Mirror session missing');
  controller.runtime.stageSession = { ...handle, value: { ...handle.value, keyTaken: true, practiced: true, ratchets } };
  expect(isSafePose(controller.runtime.pose, worldForController(controller))).toBe(true);
  syncCamera(controller, camera);
  return { controller, camera };
}

test.each(['end', 'cancel'] as const)('held left contact accepts fresh retreat intent after right %s without replaying its old vector', async phase => {
  const { controller, camera } = atLegalWinch();
  const view = await render(<TouchControls input={controller.input} enabled handedness="right" layout={controlLayout(390, 844)} />);
  const stick = view.getByTestId('movement-stick');
  await fireEvent(stick, 'touchStart', event(point(1, 40, 600)));
  await fireEvent(stick, 'touchMove', event(point(1, 40, 550)));
  expect(beginStageHoldController(controller, 'mirror-corridor-winch', 2)).toBe(true);
  for (let frame = 0; frame < 40; frame++) advanceController(controller, 1 / 60, camera);
  const before = controller.runtime.pose.position;
  expect(endStageHoldController(controller, 'mirror-corridor-winch', 2)).toBe(true);
  advanceController(controller, 1 / 60, camera);
  expect(controller.runtime.pose.position).toEqual(before);
  // The finger stays down. A new movement event supplies the retreat intent.
  await fireEvent(stick, 'touchMove', event(point(1, 40, 650)));
  advanceController(controller, 1 / 60, camera);
  expect(controller.input.stickPointer).toBe(1);
  expect(controller.runtime.pose.position.z).toBeLessThan(before.z);
  await fireEvent(stick, phase === 'end' ? 'touchEnd' : 'touchCancel', event(point(1, 40, 650)));
  expect(controller.input.stickPointer).toBeNull();
});

test.each(['touchEnd', 'touchCancel'] as const)('third tooth auto-releases through a label rerender and late %s without a second activation', async ending => {
  const { controller, camera } = atLegalWinch(2);
  const begin = jest.fn((id?: number | string) => beginStageHoldController(controller, 'mirror-corridor-winch', id));
  const end = jest.fn((id?: number | string) => endStageHoldController(controller, 'mirror-corridor-winch', id));
  const button = () => <StageHoldButton testID="hold" label={controllerSnapshot(controller).stageTarget?.label ?? '巻く'}
    holding={isStageSession(controller.runtime.stageSession?.value) && !!controller.runtime.stageSession.value.holding}
    onBegin={begin} onEnd={end} />;
  const view = await render(button());
  await fireEvent(view.getByTestId('hold'), 'touchStart', event(point(2, 320, 700)));
  await act(() => { for (let frame = 0; frame < 120; frame++) advanceController(controller, 1 / 60, camera); });
  await view.rerender(button());
  expect(controller.runtime.stageSession?.value).toMatchObject({ ratchets: 3, holding: null });
  expect(controller.input.releaseBarrierMode).toBe('owners');
  await fireEvent(view.getByTestId('hold'), ending, event(point(2, 320, 700)));
  await fireEvent.press(view.getByTestId('hold'), event(point(2, 320, 700)));
  expect(begin).toHaveBeenCalledTimes(1);
  expect(controller.runtime.stageSession?.value).toMatchObject({ ratchets: 3, holding: null });
  expect(controller.input.releaseBarrier).not.toContain(2);
});
