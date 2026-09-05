import { _roots, advance } from '@react-three/fiber/native';
import { act, fireEvent, render, type RenderResult } from '@testing-library/react-native';
import { GLView } from 'expo-gl';
import * as THREE from 'three';

import { FirstPersonScreen } from '../../../screens/FirstPersonScreen';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../../types/application';
import { ChapterScene } from '../ChapterScene';
import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../FirstPersonCanvas';
import { createSceneResources } from '../resources';
import { controllerSnapshot, createController } from '../runtimeController';

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
  const draw = jest.fn();
  return {
    render: draw, draw, setPixelRatio: jest.fn(), setSize: jest.fn(), setClearColor: jest.fn(),
    getContext: () => deviceContext, dispose: jest.fn(), forceContextLoss: jest.fn(),
    renderLists: { dispose: jest.fn() }, shadowMap: { enabled: false, type: 0 },
    info: { render: { calls: 0 }, memory: { geometries: 0, textures: 0 } },
    xr: { isPresenting: false, addEventListener: jest.fn(), removeEventListener: jest.fn() },
    outputColorSpace: '', toneMapping: 0,
  };
}
function props(): FirstPersonCanvasProps {
  const controller = createController();
  return { controller, snapshot: controllerSnapshot(controller), paused: false, neutralColors: false, preferredColor: 'neutral', effectStrength: 'medium', assist: true, reducedMotion: true, quality: 'low', onSnapshot: jest.fn(), onReady: jest.fn(), onError: jest.fn() };
}
async function createNativeContext(view: RenderResult) {
  const layoutView = view.container.queryAll((node) => typeof node.props.onLayout === 'function')[0];
  expect(layoutView).toBeDefined();
  await fireEvent(layoutView!, 'layout', { nativeEvent: { layout: { width: 390, height: 740, x: 0, y: 0 } } });
  await act(async () => {
    glView.mock.calls[glView.mock.calls.length - 1]![0].onContextCreate!(deviceContext as never);
    await Promise.resolve();
  });
}

describe('installed native R3F canvas mount and failure lifecycle (device GL excluded)', () => {
  let renderer: ReturnType<typeof fakeRenderer>;
  let diagnostics: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    glView.mockClear(); chapterScene.mockClear(); resourceFactory.mockClear();
    renderer = fakeRenderer();
    deviceContext.endFrameEXP.mockReset();
    jest.spyOn(THREE, 'WebGLRenderer').mockImplementation(() => renderer as unknown as THREE.WebGLRenderer);
    diagnostics = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    await act(async () => { await jest.advanceTimersByTimeAsync(600); });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('mounts the real chapter through native Provider and renders one frame without either reported TypeError', async () => {
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    expect(current.onReady).toHaveBeenCalledTimes(1);
    expect(current.onError).not.toHaveBeenCalled();
    const root = [..._roots.values()].find((entry) => entry.store.getState().gl === renderer as unknown as THREE.WebGLRenderer);
    expect(root).toBeDefined();
    const state = root!.store.getState();
    const meshes: THREE.Mesh[] = [];
    state.scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
    expect(meshes.length).toBeGreaterThan(20);
    expect(meshes.every((mesh) => mesh.position instanceof THREE.Vector3)).toBe(true);
    await act(() => advance(1, false, state));
    expect(renderer.draw).toHaveBeenCalled();
    expect(deviceContext.endFrameEXP).toHaveBeenCalled();
    expect(current.onError).not.toHaveBeenCalled();
    expect(diagnostics.mock.calls.flat().some((value) => String(value).includes('Cannot convert undefined value to object'))).toBe(false);
    await view.unmount();
    expect(current.controller.runtime.paused).toBe(true);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
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
    expect(diagnostics.mock.calls.some(([label, error]) => String(label).includes(': render') && error === original)).toBe(true);
    await view.unmount();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    deviceContext.endFrameEXP.mockImplementation(() => undefined);
    renderer = fakeRenderer();
    const fresh = props();
    const second = await render(<FirstPersonCanvas {...fresh} />);
    await createNativeContext(second);
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
    jest.mocked(THREE.WebGLRenderer).mockImplementation(() => { throw original; });
    const current = props();
    current.controller.input.forward = 1;
    const rootCount = _roots.size;
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    expect(current.onReady).not.toHaveBeenCalled();
    expect(current.onError).toHaveBeenCalledTimes(1);
    expect(current.controller.input.forward).toBe(0);
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
    expect(view.queryByText('部屋を開いています…')).toBeNull();
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
});
