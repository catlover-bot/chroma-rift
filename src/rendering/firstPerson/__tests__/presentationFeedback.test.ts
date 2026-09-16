import { PerspectiveCamera } from 'three';
import { advanceController, commandController, createController, flushControllerPresentationFeedback,
  queueControllerPresentationFeedback, retireController, setControllerForeground, stopController } from '../runtimeController';

function readyController() {
  const controller = createController();
  Object.assign(controller.diagnostics, { stage: 'ready', appActive: true });
  return controller;
}

test.each(['pause', 'background', 'retire', 'stop', 'session replacement'] as const)(
  '%s discards unpresented callbacks instead of replaying them on a later frame', cancellation => {
    const controller = readyController(), callback = jest.fn();
    queueControllerPresentationFeedback(controller, callback);
    expect(controller.pendingPresentationFeedback).toHaveLength(1);
    if (cancellation === 'pause') commandController(controller, { type: 'pause' });
    if (cancellation === 'background') setControllerForeground(controller, false);
    if (cancellation === 'retire') retireController(controller);
    if (cancellation === 'stop') stopController(controller);
    if (cancellation === 'session replacement') controller.runtime = { ...controller.runtime, session: controller.runtime.session + 1 };
    flushControllerPresentationFeedback(controller);
    controller.runtime = { ...controller.runtime, paused: false };
    setControllerForeground(controller, true);
    flushControllerPresentationFeedback(controller);
    expect(callback).not.toHaveBeenCalled();
    expect(controller.pendingPresentationFeedback).toEqual([]);
  },
);

test('steering preserves two accepted actions until their one successful presentation', () => {
  const controller = readyController(), first = jest.fn(), second = jest.fn();
  queueControllerPresentationFeedback(controller, first);
  commandController(controller, { type: 'turn', yaw: .1, pitch: 0 });
  queueControllerPresentationFeedback(controller, second);
  commandController(controller, { type: 'step', forward: 1 });
  expect(controller.pendingPresentationFeedback.map(item => item.sequence)).toEqual([1, 2]);
  expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled();
  flushControllerPresentationFeedback(controller);
  flushControllerPresentationFeedback(controller);
  expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
});

test('an immediately completed action survives the terminal simulation stop until presentation', () => {
  const controller = readyController(), callback = jest.fn();
  controller.runtime = { ...controller.runtime, progress: { ...controller.runtime.progress, cleared: true } };
  queueControllerPresentationFeedback(controller, callback);
  advanceController(controller, 1 / 60, new PerspectiveCamera());
  expect(callback).not.toHaveBeenCalled();
  flushControllerPresentationFeedback(controller);
  expect(callback).toHaveBeenCalledTimes(1);
});

test('one throwing effect is consumed and cannot prevent another or replay after presentation', () => {
  const controller = readyController(), first = jest.fn(() => { throw new Error('TEST haptic unavailable'); }), next = jest.fn();
  queueControllerPresentationFeedback(controller, first);
  queueControllerPresentationFeedback(controller, next);
  expect(() => flushControllerPresentationFeedback(controller)).not.toThrow();
  flushControllerPresentationFeedback(controller);
  expect(first).toHaveBeenCalledTimes(1); expect(next).toHaveBeenCalledTimes(1);
  expect(controller.runtime.progress.cleared).toBe(false);
});

test('unready, background, paused and retired controllers cannot accumulate feedback', () => {
  const controller = createController(), callback = jest.fn();
  queueControllerPresentationFeedback(controller, callback);
  controller.diagnostics.stage = 'ready';
  setControllerForeground(controller, false);
  queueControllerPresentationFeedback(controller, callback);
  setControllerForeground(controller, true);
  queueControllerPresentationFeedback(controller, callback);
  retireController(controller);
  queueControllerPresentationFeedback(controller, callback);
  expect(controller.pendingPresentationFeedback).toEqual([]);
  expect(callback).not.toHaveBeenCalled();
});
