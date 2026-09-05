import type * as THREE from 'three';

import { createCanvasLifecycle } from '../canvasLifecycle';
import { createController } from '../runtimeController';

describe('canvas ownership across late native callbacks', () => {
  it('disposes replaced and final renderers once and stops late roots without publishing into reentry', () => {
    const oldController = createController();
    const onOldError = jest.fn();
    const old = createCanvasLifecycle(oldController, onOldError);
    const first = { dispose: jest.fn() } as unknown as THREE.WebGLRenderer;
    const second = { dispose: jest.fn() } as unknown as THREE.WebGLRenderer;
    old.ownRenderer(first);
    old.ownRenderer(second);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    old.close(); old.close();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    const currentController = createController();
    const onCurrentError = jest.fn();
    const current = createCanvasLifecycle(currentController, onCurrentError);
    const lateRoot = { setFrameloop: jest.fn() };
    expect(old.attachRoot(lateRoot)).toBe(false);
    expect(old.markReady()).toBe(false);
    old.fail(new Error('late failure'), 'render');
    expect(lateRoot.setFrameloop).toHaveBeenCalledWith('never');
    expect(oldController.runtime.paused).toBe(true);
    expect(currentController.runtime.paused).toBe(false);
    expect(current.active).toBe(true);
    expect(onOldError).not.toHaveBeenCalled();
    expect(onCurrentError).not.toHaveBeenCalled();
    current.close();
  });
});
