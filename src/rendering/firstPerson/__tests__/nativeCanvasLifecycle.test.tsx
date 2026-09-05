import { _roots, advance, useFrame } from '@react-three/fiber/native';
import { act, fireEvent, render, type RenderResult } from '@testing-library/react-native';
import { GLView } from 'expo-gl';
import type { ComponentProps } from 'react';
import * as THREE from 'three';

import { createCheckpoint, createInitialRuntime } from '../../../domain/firstPerson';
import { FirstPersonScreen } from '../../../screens/FirstPersonScreen';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../../types/application';
import { ChapterScene } from '../ChapterScene';
import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../FirstPersonCanvas';
import { createSceneResources } from '../resources';
import { commandController, controllerSnapshot, createController } from '../runtimeController';

// Keep installed native Canvas, Provider, reconciler, applyProps and useFrame.
// Only the unavailable device GL context/renderer is replaced.
jest.mock('expo-gl', () => ({ GLView: jest.fn(() => null) }));
jest.mock('../ChapterScene', () => ({ ChapterScene: jest.fn((props) => jest.requireActual('../ChapterScene').ChapterScene(props)) }));
jest.mock('../resources', () => ({ ...jest.requireActual('../resources'), createSceneResources: jest.fn((low: boolean) => jest.requireActual('../resources').createSceneResources(low)) }));

const glView = jest.mocked(GLView);
const chapterScene = jest.mocked(ChapterScene);
const resourceFactory = jest.mocked(createSceneResources);
const deviceContext = { drawingBufferWidth: 390, drawingBufferHeight: 740, endFrameEXP: jest.fn() };
function fakeRenderer() {
  const viewport = new THREE.Vector4(0, 0, 390, 740);
  const info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 4, textures: 1 } };
  // Contract substitute only: update genuine scene matrices as Three.render
  // would, then report synthetic submission counters. This executes no GPU.
  const draw = jest.fn((scene: THREE.Scene, camera: THREE.Camera) => {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    info.render.calls = 3;
    info.render.triangles = 36;
  });
  return {
    render: draw, draw, setPixelRatio: jest.fn(), setSize: jest.fn((width: number, height: number) => { viewport.set(0, 0, width, height); }), setClearColor: jest.fn(),
    getContext: () => deviceContext, dispose: jest.fn(), forceContextLoss: jest.fn(),
    getViewport: jest.fn((target: THREE.Vector4) => target.copy(viewport)),
    getScissor: (target: THREE.Vector4) => target.copy(viewport), getScissorTest: () => false,
    getPixelRatio: () => 1, getRenderTarget: () => null,
    debug: { checkShaderErrors: true, onShaderError: null as THREE.WebGLRenderer['debug']['onShaderError'] },
    renderLists: { dispose: jest.fn() }, shadowMap: { enabled: false, type: 0 },
    info,
    xr: { isPresenting: false, addEventListener: jest.fn(), removeEventListener: jest.fn() },
    outputColorSpace: '', toneMapping: 0,
  };
}
function props(): FirstPersonCanvasProps {
  const controller = createController();
  return { controller, snapshot: controllerSnapshot(controller), paused: false, neutralColors: false, preferredColor: 'neutral', effectStrength: 'medium', assist: true, reducedMotion: true, quality: 'low', onSnapshot: jest.fn(), onReady: jest.fn(), onError: jest.fn() };
}
async function createNativeContext(view: RenderResult) {
  // Both the measured outer view and installed native Canvas's internal view
  // receive layout in RN. Reporting only the outer view never creates GLView.
  const layoutViews = view.container.queryAll((node) => typeof node.props.onLayout === 'function');
  expect(layoutViews.length).toBeGreaterThanOrEqual(2);
  for (const layoutView of layoutViews) await fireEvent(layoutView, 'layout', { nativeEvent: { layout: { width: 390, height: 740, x: 0, y: 0 } } });
  await act(async () => {
    glView.mock.calls[glView.mock.calls.length - 1]![0].onContextCreate!(deviceContext as never);
    await Promise.resolve();
  });
}
function rendererRoot(renderer: ReturnType<typeof fakeRenderer>) {
  const root = [..._roots.values()].find((entry) => entry.store.getState().gl === renderer as unknown as THREE.WebGLRenderer);
  expect(root).toBeDefined();
  return root!;
}
async function submitFrame(renderer: ReturnType<typeof fakeRenderer>, time = 1) {
  await act(() => advance(time, false, rendererRoot(renderer).store.getState()));
}

describe('installed native R3F canvas mount and failure lifecycle (device GL excluded)', () => {
  let renderer: ReturnType<typeof fakeRenderer>;
  let diagnostics: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    glView.mockClear(); chapterScene.mockClear(); resourceFactory.mockClear();
    renderer = fakeRenderer();
    deviceContext.endFrameEXP.mockReset();
    jest.spyOn(THREE, 'WebGLRenderer').mockImplementation((options) => {
      (options!.canvas as HTMLCanvasElement).getContext('webgl2', { antialias: options!.antialias });
      return renderer as unknown as THREE.WebGLRenderer;
    });
    diagnostics = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    await act(async () => { await jest.advanceTimersByTimeAsync(600); });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('keeps one live renderer when the constructor requests the real native adapter context', async () => {
    const created: ReturnType<typeof fakeRenderer>[] = [];
    jest.mocked(THREE.WebGLRenderer).mockImplementation((options) => {
      (options!.canvas as HTMLCanvasElement).getContext('webgl2', { antialias: options!.antialias });
      const next = fakeRenderer();
      created.push(next);
      return next as unknown as THREE.WebGLRenderer;
    });
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    expect(created).toHaveLength(1);
    const state = [..._roots.values()].at(-1)!.store.getState();
    expect(state.gl).toBe(created[0]);
    expect(created[0]!.dispose).not.toHaveBeenCalled();
    expect(current.onReady).not.toHaveBeenCalled();
    await act(() => advance(1, false, state));
    expect(created[0]!.draw).toHaveBeenCalledTimes(1);
    expect(deviceContext.endFrameEXP).toHaveBeenCalledTimes(1);
    expect(current.onReady).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('mounts the real chapter through native Provider and renders one frame without either reported TypeError', async () => {
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.controller.diagnostics.sceneCommitted).toBe(true);
    expect(current.controller.diagnostics).toMatchObject({ stage: 'scene-committed', contextCreates: 1, rendererCreates: 1, frameCallbacks: 0, simulationTicks: 0, renderCalls: 0, renderReturns: 0, presentationReturns: 0 });
    expect(current.onError).not.toHaveBeenCalled();
    const root = [..._roots.values()].find((entry) => entry.store.getState().gl === renderer as unknown as THREE.WebGLRenderer);
    expect(root).toBeDefined();
    const state = root!.store.getState();
    const meshes: THREE.Mesh[] = [];
    state.scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
    expect(meshes.length).toBeGreaterThan(20);
    expect(meshes.every((mesh) => mesh.position instanceof THREE.Vector3)).toBe(true);
    await act(() => advance(1, false, state));
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    expect(deviceContext.endFrameEXP).toHaveBeenCalledTimes(1);
    expect(current.onReady).toHaveBeenCalledTimes(1);
    expect(current.controller.diagnostics).toMatchObject({ frameCallbacks: 1, simulationTicks: 0, renderCalls: 1, renderReturns: 1, presentationReturns: 1, pixelEvidence: 'not-sampled' });
    expect(current.controller.diagnostics).toMatchObject({ stage: 'ready', rnLayout: { width: 390, height: 740 }, drawingBuffer: { width: 390, height: 740 }, camera: { aspect: 390 / 740, valid: true }, lastFrame: { drawCalls: 3, triangles: 36 }, pose: { safe: true } });
    expect(current.onError).not.toHaveBeenCalled();
    expect(diagnostics.mock.calls.flat().some((value) => String(value).includes('Cannot convert undefined value to object'))).toBe(false);
    await view.unmount();
    expect(current.controller.runtime.paused).toBe(true);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('publishes a presented aim cue after an explicit turn even inside the same compass and target bucket', async () => {
    const current = props();
    // Close enough to the guide, but initially looking above its target sphere.
    current.controller.runtime = { ...current.controller.runtime, pose: { ...current.controller.runtime.pose, position: { x: 0, y: 1.6, z: 1 } } };
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    await submitFrame(renderer);
    await submitFrame(renderer, 2);
    const publish = jest.mocked(current.onSnapshot);
    expect(publish).toHaveBeenCalledTimes(1);
    const before = publish.mock.calls[0]![0];
    expect(before.cue).toMatchObject({ kind: 'aim', target: { id: 'guide' } });
    expect(before.direction).toBe('北');
    // Overshoot below the guide: still 'aim' and north, but the instruction
    // now needs the opposite pitch correction. Screen publishes this command
    // immediately, before the real camera matrices have caught up.
    commandController(current.controller, { type: 'turn', yaw: 0, pitch: -0.6 });
    const command = controllerSnapshot(current.controller);
    expect(command.cue.kind).toBe('none');
    current.onSnapshot(command);
    await submitFrame(renderer, 3);
    expect(publish).toHaveBeenCalledTimes(3);
    const presented = publish.mock.calls[2]![0];
    expect(presented.cue).toMatchObject({ kind: 'aim', target: { id: 'guide' } });
    expect(presented.direction).toBe(before.direction);
    expect(presented.runtime.pose.pitch).toBeCloseTo(-0.6);
    expect(presented.key).not.toBe(before.key);
    // No subsequent per-frame React update is introduced by that command.
    await submitFrame(renderer, 4);
    await submitFrame(renderer, 5);
    expect(publish).toHaveBeenCalledTimes(3);
    await view.unmount();
  });

  it('forwards a reconciler scene failure with its original stack, stops once and ignores late callbacks', async () => {
    const original = new TypeError('Injected scene mount fault');
    chapterScene.mockImplementation(() => { throw original; });
    try {
      const current = props();
      current.controller.input.forward = 1;
      const view = await render(<FirstPersonCanvas {...current} />);
      await createNativeContext(view);
      expect(current.onError).toHaveBeenCalledTimes(1);
      expect(current.controller.input.forward).toBe(0);
      expect(current.controller.runtime.paused).toBe(true);
      expect(diagnostics.mock.calls.some(([label, error, stack]) => String(label).includes('scene mount') && error === original && typeof stack === 'string' && stack.length > 0)).toBe(true);
      await act(async () => { await jest.advanceTimersByTimeAsync(15000); });
      expect(current.onError).toHaveBeenCalledTimes(1);
      await view.unmount();
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
    } finally { chapterScene.mockImplementation((value) => jest.requireActual('../ChapterScene').ChapterScene(value)); }
  });

  it('handles a real render-loop exception once and disposes scene resources before a fresh entry', async () => {
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    await submitFrame(renderer);
    const firstResources = resourceFactory.mock.results[0]!.value as ReturnType<typeof createSceneResources>;
    const disposed = jest.fn();
    firstResources.texture.addEventListener('dispose', disposed);
    const root = [..._roots.values()].find((entry) => entry.store.getState().gl === renderer as unknown as THREE.WebGLRenderer)!;
    const state = root.store.getState();
    const original = new Error('Injected GPU render fault');
    // Exercise an EXGL failure in the native endFrameEXP wrapper.
    deviceContext.endFrameEXP.mockImplementation(() => { throw original; });
    await act(() => advance(1, false, state));
    await act(() => advance(2, false, state));
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(root.store.getState().frameloop).toBe('never');
    expect(current.controller.runtime.paused).toBe(true);
    expect(diagnostics.mock.calls.some(([label, error]) => String(label).includes(': presentation') && error === original)).toBe(true);
    await view.unmount();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    deviceContext.endFrameEXP.mockImplementation(() => undefined);
    renderer = fakeRenderer();
    const fresh = props();
    const second = await render(<FirstPersonCanvas {...fresh} />);
    await createNativeContext(second);
    expect(fresh.onReady).not.toHaveBeenCalled();
    await submitFrame(renderer);
    expect(fresh.onReady).toHaveBeenCalledTimes(1);
    expect(fresh.onError).not.toHaveBeenCalled();
    const secondResources = resourceFactory.mock.results[resourceFactory.mock.results.length - 1]!.value as ReturnType<typeof createSceneResources>;
    expect(secondResources.texture.uuid).not.toBe(firstResources.texture.uuid);
    await second.unmount();
  });

  it('handles onCreated setup errors without publishing ready or leaking the original error', async () => {
    const original = new Error('Injected setClearColor fault');
    renderer.setClearColor.mockImplementation(() => { throw original; });
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(current.controller.runtime.paused).toBe(true);
    expect(diagnostics.mock.calls.some(([label, error]) => String(label).includes('scene initialization') && error === original)).toBe(true);
    await view.unmount();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('finishes failed configuration only for cleanup without a pending Promise or a playable fallback', async () => {
    const original = new Error('Injected WebGL constructor fault');
    jest.mocked(THREE.WebGLRenderer).mockImplementation((options) => {
      (options!.canvas as HTMLCanvasElement).getContext('webgl2', { antialias: options!.antialias });
      throw original;
    });
    const current = props();
    current.controller.input.forward = 1;
    const rootCount = _roots.size;
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(current.controller.input.forward).toBe(0);
    expect(current.controller.diagnostics).toMatchObject({ contextCreates: 1, rendererCreates: 0, renderCalls: 0, presentationReturns: 0, rendererOwnership: 'teardown-only' });
    expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
    const root = [..._roots.values()][_roots.size - 1]!;
    expect(root.store.getState().frameloop).toBe('never');
    expect(root.store.getState().scene).toBeInstanceOf(THREE.Scene);
    expect(diagnostics.mock.calls.some(([label, error]) => String(label).includes('renderer initialization') && error === original)).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(15000); });
    expect(current.onError).toHaveBeenCalledTimes(1);
    await view.unmount();
    await act(async () => { await jest.advanceTimersByTimeAsync(600); });
    expect(_roots.size).toBe(rootCount);
    jest.mocked(THREE.WebGLRenderer).mockImplementation(() => renderer as unknown as THREE.WebGLRenderer);
    const fresh = props();
    const second = await render(<FirstPersonCanvas {...fresh} />);
    await createNativeContext(second);
    await submitFrame(renderer);
    expect(fresh.onReady).toHaveBeenCalledTimes(1);
    expect(fresh.onError).not.toHaveBeenCalled();
    await second.unmount();
  });

  it('shows the actual screen error immediately after failed native initialization and permits home', async () => {
    const original = new Error('Injected unavailable GL renderer');
    jest.mocked(THREE.WebGLRenderer).mockImplementation(() => { throw original; });
    const onExit = jest.fn();
    const onComplete = jest.fn();
    const rootsBefore = _roots.size;
    const view = await render(<FirstPersonScreen settings={DEFAULT_SETTINGS} controls={DEFAULT_FIRST_PERSON_CONTROLS} preferredColor="neutral" onSettingsChange={jest.fn()} onControlsChange={jest.fn()} onCheckpoint={jest.fn()} onComplete={onComplete} onRestart={jest.fn()} onExit={onExit} />);
    await createNativeContext(view);
    expect(view.getByText('3Dを表示できませんでした')).toBeTruthy();
    expect(view.queryByTestId('first-person-play')).toBeNull();
    expect(view.queryByText('部屋の描画を準備しています…')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(600); });
    expect(_roots.size).toBe(rootsBefore);
    await view.unmount();
  });

  it('reports a native context that never arrives as one controlled failure', async () => {
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await act(async () => { await jest.advanceTimersByTimeAsync(12000); });
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(current.controller.runtime.paused).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(12000); });
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(diagnostics.mock.calls.some(([label, error]) => String(label).includes('initialization timeout') && error instanceof Error)).toBe(true);
    await view.unmount();
  });

  it('times out a committed chapter whose render wrapper never executes without simulating or publishing progress', async () => {
    const current = { ...props(), startupTimeoutMs: 200 };
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    const blockedRender = jest.spyOn(renderer, 'render').mockImplementation(() => undefined);
    const initialProgress = current.controller.runtime.progress;
    current.controller.input.forward = 1;
    await submitFrame(renderer);
    expect(current.controller.runtime.progress).toBe(initialProgress);
    expect(current.controller.diagnostics).toMatchObject({ sceneCommitted: true, simulationTicks: 0, renderCalls: 0, presentationReturns: 0 });
    expect(current.onSnapshot).not.toHaveBeenCalled();
    expect(current.onReady).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(200); });
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(current.controller.diagnostics.lastError?.phase).toBe('initialization timeout');
    blockedRender.mockRestore();
    await view.unmount();
  });

  it.each(['zero viewport', 'nonfinite camera'] as const)('keeps %s unready after a returned render and fails at the startup deadline', async (invalid) => {
    if (invalid === 'zero viewport') renderer.getViewport.mockImplementation((target) => target.set(0, 0, 0, 740));
    else {
      const draw = renderer.draw.getMockImplementation()!;
      renderer.draw.mockImplementation((scene, camera) => { draw(scene, camera); camera.projectionMatrix.elements[0] = NaN; });
    }
    const current = { ...props(), startupTimeoutMs: 200 };
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    await submitFrame(renderer);
    expect(current.controller.diagnostics.presentationReturns).toBe(1);
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.onSnapshot).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(200); });
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(current.controller.runtime.paused).toBe(true);
    await view.unmount();
  });

  it('limits synchronous GL and scene inspection during invalid startup and resumes readiness on a fresh sampled frame', async () => {
    const getError = jest.fn(() => 0);
    const checkFramebufferStatus = jest.fn(() => 0x8cd5);
    const measuredContext = { ...deviceContext, NO_ERROR: 0, FRAMEBUFFER: 0x8d40, FRAMEBUFFER_COMPLETE: 0x8cd5, getError, checkFramebufferStatus };
    jest.spyOn(renderer, 'getContext').mockReturnValue(measuredContext);
    renderer.getViewport.mockImplementation((target) => target.set(0, 0, 0, 740));
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    // Drive explicit frames so advancing the deadline clock cannot also run
    // Jest's synthetic requestAnimationFrame loop hundreds of times.
    await act(() => rendererRoot(renderer).store.getState().setFrameloop('never'));
    renderer.getViewport.mockClear();
    await submitFrame(renderer);
    // One bounded GL check on each side of native presentation, one scene
    // sample, despite subsequent frame callbacks at the same wall-clock time.
    for (let time = 2; time <= 10; time += 1) await submitFrame(renderer, time);
    expect(getError).toHaveBeenCalledTimes(2);
    expect(checkFramebufferStatus).toHaveBeenCalledTimes(2);
    expect(renderer.getViewport).toHaveBeenCalledTimes(1);
    expect(current.controller.diagnostics.sceneSampleRenderReturn).toBe(1);
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.controller.diagnostics.simulationTicks).toBe(0);
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    await submitFrame(renderer, 11);
    expect(getError).toHaveBeenCalledTimes(4);
    expect(checkFramebufferStatus).toHaveBeenCalledTimes(4);
    expect(renderer.getViewport).toHaveBeenCalledTimes(2);
    expect(current.controller.diagnostics.sceneSampleRenderReturn).toBe(11);
    expect(current.onReady).not.toHaveBeenCalled();
    renderer.getViewport.mockImplementation((target) => target.set(0, 0, 390, 740));
    await submitFrame(renderer, 12);
    expect(current.onReady).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    await submitFrame(renderer, 13);
    expect(current.onReady).toHaveBeenCalledTimes(1);
    expect(current.controller.diagnostics.sceneSampleRenderReturn).toBe(13);
    expect(getError).toHaveBeenCalledTimes(6);
    // Normal play keeps diagnostic camera/scene records fresh at 1 Hz.
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    await submitFrame(renderer, 14);
    expect(current.controller.diagnostics.sceneSampleRenderReturn).toBe(13);
    expect(getError).toHaveBeenCalledTimes(6);
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    await submitFrame(renderer, 15);
    expect(current.controller.diagnostics.sceneSampleRenderReturn).toBe(15);
    expect(getError).toHaveBeenCalledTimes(8);
    expect(current.onError).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('does not replace a zero RN layout with the native adapter’s stale positive size before readiness', async () => {
    const current = { ...props(), startupTimeoutMs: 200 };
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    for (const layoutView of view.container.queryAll((node) => typeof node.props.onLayout === 'function')) {
      await fireEvent(layoutView, 'layout', { nativeEvent: { layout: { width: 0, height: 0, x: 0, y: 0 } } });
    }
    await submitFrame(renderer);
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.controller.diagnostics.rnLayout).toEqual({ width: 0, height: 0 });
    await act(async () => { await jest.advanceTimersByTimeAsync(200); });
    expect(current.onError).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('excludes background and pause time from startup and still becomes ready on the first resumed frame', async () => {
    const current = { ...props(), startupTimeoutMs: 1000 };
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    const blockedRender = jest.spyOn(renderer, 'render').mockImplementation(() => undefined);
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    await view.rerender(<FirstPersonCanvas {...current} appActive={false} />);
    await act(async () => { await jest.advanceTimersByTimeAsync(10000); });
    expect(current.onError).not.toHaveBeenCalled();
    commandController(current.controller, { type: 'pause' });
    await view.rerender(<FirstPersonCanvas {...current} appActive paused />);
    await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
    expect(current.onError).not.toHaveBeenCalled();
    commandController(current.controller, { type: 'resume' });
    await view.rerender(<FirstPersonCanvas {...current} appActive paused={false} />);
    await act(async () => { await jest.advanceTimersByTimeAsync(500); });
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.onError).not.toHaveBeenCalled();
    blockedRender.mockRestore();
    await submitFrame(renderer);
    expect(current.onReady).toHaveBeenCalledTimes(1);
    expect(current.controller.runtime.paused).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(current.onError).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('retains an underlying render exception and stops the first frame before readiness or presentation', async () => {
    const original = new Error('Injected Three render failure');
    renderer.draw.mockImplementation(() => { throw original; });
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    await submitFrame(renderer);
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(deviceContext.endFrameEXP).not.toHaveBeenCalled();
    expect(current.controller.diagnostics).toMatchObject({ renderCalls: 1, renderReturns: 0, presentationReturns: 0, lastError: { phase: 'render', message: original.message } });
    expect(diagnostics.mock.calls.some(([label, error]) => String(label).includes(': render') && error === original)).toBe(true);
    await view.unmount();
  });

  it('treats a nonthrowing shader-link failure as a failed frame while retaining program and shader logs', async () => {
    const shaderContext = { getProgramInfoLog: () => 'program link failed', getShaderInfoLog: (shader: unknown) => shader === vertex ? 'vertex compile failed' : 'fragment compile failed' };
    const vertex = {} as WebGLShader;
    const fragment = {} as WebGLShader;
    const program = {} as Parameters<NonNullable<THREE.WebGLRenderer['debug']['onShaderError']>>[1];
    renderer.draw.mockImplementation(() => { renderer.debug.onShaderError!(shaderContext as unknown as WebGLRenderingContext, program, vertex, fragment); });
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    current.controller.input.forward = 1;
    await submitFrame(renderer);
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(current.controller.input.forward).toBe(0);
    expect(current.controller.runtime.paused).toBe(true);
    expect(current.controller.diagnostics.lastError?.phase).toBe('shader');
    expect(current.controller.diagnostics.shaderErrors).toEqual([{ program: 'program link failed', vertex: 'vertex compile failed', fragment: 'fragment compile failed' }]);
    await view.unmount();
  });

  it.each(['render', 'scene frame'] as const)('rolls back an unpresented floor-mark step when the %s fails', async (phase) => {
    const initial = createInitialRuntime();
    const checkpoint = createCheckpoint({ ...initial, pose: { ...initial.pose, position: { x: 0, y: 1.6, z: -5 } }, progress: { ...initial.progress, guideExamined: true } });
    const controller = createController(checkpoint);
    const current = { ...props(), controller, snapshot: controllerSnapshot(controller) };
    const original = new Error('Injected fault during the first mark step');
    let frameShouldFail = false;
    let candidateMarked = false;
    const ActualChapterScene = jest.requireActual('../ChapterScene').ChapterScene as typeof ChapterScene;
    chapterScene.mockImplementation(function FaultingScene(sceneProps: ComponentProps<typeof ChapterScene>) {
      useFrame(() => {
        if (frameShouldFail && phase === 'scene frame') {
          candidateMarked = controller.runtime.progress.markActivated;
          sceneProps.onFrameError?.(original);
        }
      });
      return <ActualChapterScene {...sceneProps} />;
    });
    const view = await render(<FirstPersonCanvas {...current} />);
    try {
      await createNativeContext(view);
      await submitFrame(renderer);
      expect(current.onReady).toHaveBeenCalledTimes(1);
      const before = controller.runtime;
      expect(before.progress.markActivated).toBe(false);
      frameShouldFail = true;
      if (phase === 'render') renderer.draw.mockImplementation(() => { candidateMarked = controller.runtime.progress.markActivated; throw original; });
      // A 0.5375m backward step from z=-5 enters the authored mark radius.
      commandController(controller, { type: 'step', forward: -1 });
      await submitFrame(renderer, 2);
      expect(candidateMarked).toBe(true);
      expect(controller.runtime.pose).toEqual(before.pose);
      expect(controller.runtime.progress).toEqual(before.progress);
      expect(controller.runtime.paused).toBe(true);
      expect(controller.input.forward).toBe(0);
      expect(current.onSnapshot).not.toHaveBeenCalled();
      expect(current.onError).toHaveBeenCalledTimes(1);
      expect(controller.diagnostics.lastError?.phase).toBe(phase);
    } finally {
      await view.unmount();
      chapterScene.mockImplementation((value) => jest.requireActual('../ChapterScene').ChapterScene(value));
    }
  });

  it('retries the actual error screen with fresh resources and preserved progress while old render callbacks remain inert', async () => {
    const initial = createInitialRuntime();
    const checkpoint = createCheckpoint({ ...initial, progress: { ...initial.progress, guideExamined: true } });
    const rootsBefore = _roots.size;
    const view = await render(<FirstPersonScreen settings={DEFAULT_SETTINGS} controls={DEFAULT_FIRST_PERSON_CONTROLS} checkpoint={checkpoint} preferredColor="neutral" onSettingsChange={jest.fn()} onControlsChange={jest.fn()} onCheckpoint={jest.fn()} onComplete={jest.fn()} onRestart={jest.fn()} onExit={jest.fn()} />);
    await createNativeContext(view);
    const oldRenderer = renderer;
    const oldState = rendererRoot(renderer).store.getState();
    const oldRender = oldState.gl.render;
    const oldResources = resourceFactory.mock.results[0]!.value as ReturnType<typeof createSceneResources>;
    const disposed = jest.fn();
    oldResources.texture.addEventListener('dispose', disposed);
    await submitFrame(renderer);
    renderer.draw.mockImplementation(() => { throw new Error('Injected frame fault before retry'); });
    await submitFrame(renderer, 2);
    expect(view.getByText('3Dを表示できませんでした')).toBeTruthy();
    expect(disposed).toHaveBeenCalledTimes(1);
    renderer = fakeRenderer();
    await fireEvent.press(view.getByRole('button', { name: '表示を再試行' }));
    await createNativeContext(view);
    expect(view.getByText('部屋の描画を準備しています…')).toBeTruthy();
    await submitFrame(renderer);
    expect(view.queryByText('部屋の描画を準備しています…')).toBeNull();
    const freshResources = resourceFactory.mock.results.at(-1)!.value as ReturnType<typeof createSceneResources>;
    expect(freshResources.texture.uuid).not.toBe(oldResources.texture.uuid);
    expect(chapterScene.mock.calls.at(-1)![0].runtime.current.progress).toEqual(checkpoint.progress);
    const previousDraws = oldRenderer.draw.mock.calls.length;
    await act(() => oldRender(oldState.scene, oldState.camera));
    expect(oldRenderer.draw).toHaveBeenCalledTimes(previousDraws);
    expect(view.queryByText('3Dを表示できませんでした')).toBeNull();
    await act(async () => { await jest.advanceTimersByTimeAsync(600); });
    expect(_roots.size).toBe(rootsBefore + 1);
    await view.unmount();
    await act(async () => { await jest.advanceTimersByTimeAsync(600); });
    expect(_roots.size).toBe(rootsBefore);
  });

  it('fails an unexpected native context replacement after readiness without constructing another renderer or leaking either root', async () => {
    const current = props();
    const rootsBefore = _roots.size;
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    await submitFrame(renderer);
    expect(current.onReady).toHaveBeenCalledTimes(1);
    const before = current.controller.runtime;
    current.controller.input.forward = 1;
    await act(async () => {
      glView.mock.calls.at(-1)![0].onContextCreate!({ ...deviceContext, endFrameEXP: jest.fn() } as never);
      await Promise.resolve();
    });
    expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(current.onReady).toHaveBeenCalledTimes(1);
    expect(current.controller.input.forward).toBe(0);
    expect(current.controller.runtime.progress).toEqual(before.progress);
    expect(current.controller.runtime.paused).toBe(true);
    expect(current.controller.diagnostics.lastError).toMatchObject({ phase: 'renderer initialization', message: 'The native Canvas context was replaced. A fresh scene retry is required.' });
    await act(async () => { await jest.advanceTimersByTimeAsync(15000); });
    expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
    await view.unmount();
    await act(async () => { await jest.advanceTimersByTimeAsync(600); });
    expect(_roots.size).toBe(rootsBefore);
  });
});
