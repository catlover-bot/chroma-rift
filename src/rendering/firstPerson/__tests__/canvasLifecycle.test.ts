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
    expect(old.isCurrentRenderer(first)).toBe(false);
    expect(old.isCurrentRenderer(second)).toBe(true);
    old.attachRoot({ setFrameloop: jest.fn() });
    old.commitScene();
    oldController.diagnostics.renderReturns = 1;
    oldController.diagnostics.presentationReturns = 1;
    expect(old.markReady(true)).toBe(true);
    old.close(); old.close();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    const currentController = createController();
    const onCurrentError = jest.fn();
    const current = createCanvasLifecycle(currentController, onCurrentError);
    const lateRoot = { setFrameloop: jest.fn() };
    expect(old.attachRoot(lateRoot)).toBe(false);
    expect(old.markReady(true)).toBe(false);
    expect(old.isCurrentRenderer(second)).toBe(false);
    old.commitScene(); old.submitFrame();
    expect(oldController.diagnostics.stage).toBe('closed');
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
