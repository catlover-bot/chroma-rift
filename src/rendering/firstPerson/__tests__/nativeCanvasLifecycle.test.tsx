import { GALLERY_CHAPTER_ID, GALLERY_SHADOW_OBSERVATION_POSE, GALLERY_CONTOUR_OBSERVATION_POSE, GALLERY_CONTOUR_FIXTURE, createContourSpec, normalizeAngle } from '../../../domain/gallery';
import { galleryAction } from '../galleryController';
import { _roots, advance, useFrame } from '@react-three/fiber/native';
import { act, fireEvent, render, type RenderResult } from '@testing-library/react-native';
import { GLView } from 'expo-gl';
import type { ComponentProps } from 'react';
import { Dimensions } from 'react-native';
import * as THREE from 'three';

import { createSealStimulus } from '../../../domain/emblem';
import { EMBLEM_FIXTURE, EMBLEM_LATCH, EMBLEM_SWITCHES, EMBLEM_SWITCH_TRAVEL } from '../../../domain/firstPerson/emblemFixture';
import { getWorld } from '../../../domain/firstPerson/chapter';
import { isSafePose, segmentOccluded } from '../../../domain/firstPerson/geometry';
import { createCheckpoint, createInitialRuntime } from '../../../domain/firstPerson';
import { FirstPersonScreen } from '../../../screens/FirstPersonScreen';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../../types/application';
import { ChapterScene } from '../ChapterScene';
import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../FirstPersonCanvas';
import { createSceneResources } from '../resources';
import { commandController, controllerSnapshot, createController, createEmblemCommand, dispatchEmblemController, interactController, syncCamera } from '../runtimeController';

// Keep installed native Canvas, Provider, reconciler, applyProps and useFrame.
// Only the unavailable device GL context/renderer is replaced.
jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), useSafeAreaInsets: jest.fn(() => ({ top: 47, bottom: 34, left: 0, right: 0 })) }));
jest.mock('expo-gl', () => ({ GLView: jest.fn(() => null) }));
jest.mock('../ChapterScene', () => ({ ChapterScene: jest.fn((props) => jest.requireActual('../ChapterScene').ChapterScene(props)) }));
jest.mock('../resources', () => ({ ...jest.requireActual('../resources'), createSceneResources: jest.fn((...args: Parameters<typeof createSceneResources>) => jest.requireActual('../resources').createSceneResources(...args)) }));

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

  it.each(['low', 'standard'] as const)('renders a planar emblem, physical glyphs and the retained return landmark at %s quality', async (quality) => {
    const current = { ...props(), quality };
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    await submitFrame(renderer);
    const scene = rendererRoot(renderer).store.getState().scene;
    const plate = scene.getObjectByName('emblem-plate') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    expect(plate).toBeDefined();
    expect(plate.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([EMBLEM_FIXTURE.center.x, EMBLEM_FIXTURE.center.y, EMBLEM_FIXTURE.center.z]);
    expect(plate.scale.toArray()).toEqual([EMBLEM_FIXTURE.width, EMBLEM_FIXTURE.height, 1]);
    expect(plate.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(plate.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(plate.material).toMatchObject({ transparent: false, opacity: 1, toneMapped: false, fog: false, depthTest: true, depthWrite: true });
    expect(plate.material.color.toArray()).toEqual([1, 1, 1]);
    expect(plate.material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(plate.castShadow).toBe(false);
    expect(plate.receiveShadow).toBe(false);
    const plateSize = new THREE.Box3().setFromObject(plate).getSize(new THREE.Vector3());
    expect(plateSize.x).toBeCloseTo(EMBLEM_FIXTURE.width, 10);
    expect(plateSize.y).toBeCloseTo(EMBLEM_FIXTURE.height, 10);
    expect(plateSize.z).toBe(0);
    const fixtureBounds = new THREE.Box3().setFromObject(scene.getObjectByName('emblem-fixture')!);
    expect(fixtureBounds.min.x).toBeGreaterThanOrEqual(1.0399);
    expect(fixtureBounds.max.x).toBeLessThanOrEqual(2.8601);
    expect(fixtureBounds.min.y).toBeGreaterThan(0.91);
    expect(fixtureBounds.max.y).toBeLessThan(2.75);
    for (const item of EMBLEM_SWITCHES) {
      const glyph = scene.getObjectByName('emblem-switch-' + item.glyph)!;
      expect(glyph.position.toArray()).toEqual([item.center.x, item.center.y, item.center.z]);
      const glyphSize = new THREE.Box3().setFromObject(scene.getObjectByName('emblem-glyph-' + item.glyph)!).getSize(new THREE.Vector3());
      expect(glyphSize.x).toBeCloseTo(item.width, 5);
      expect(glyphSize.y).toBeCloseTo(item.height, 5);
    }
    expect(scene.getObjectByName('guide-fixture')).toBeUndefined();
    expect(scene.getObjectByName('floor-device-face')).toBeUndefined();
    const corridor = new THREE.PerspectiveCamera(65, 390 / 763, 0.08, 60);
    corridor.position.set(0, 1.6, 1); corridor.updateMatrixWorld(true);
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) {
      const corner = plate.localToWorld(new THREE.Vector3(x, y, 0));
      const projected = corner.clone().project(corridor);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
      expect(segmentOccluded({ x: 0, y: 1.6, z: 1 }, { x: corner.x, y: corner.y, z: corner.z }, getWorld(current.controller.runtime), 'emblem-panel-body')).toBe(false);
    }
    expect(isSafePose({ position: { x: 1.95, y: 1.6, z: -5.7 }, yaw: 0, pitch: 0 }, getWorld(current.controller.runtime))).toBe(true);
    const landmark = scene.getObjectByName('remembered-entry-landmark')!;
    const remembered = landmark.children.map((object) => object.matrixWorld.toArray());
    expect(scene.getObjectByName('entry-front-mark')!.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(6);
    expect(scene.getObjectByName('entry-back-mark')!.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(6);
    // Appearance fixture only; host command/progression tests prove actual
    // eligibility and occluded return swapping.
    current.controller.runtime = { ...current.controller.runtime, emblem: { ...current.controller.runtime.emblem, phase: 'released' },
      progress: { ...current.controller.runtime.progress, sealA: true, sealB: true, variant: 'exit' }, doorAOpen: 1, doorBOpen: 1 };
    await view.rerender(<FirstPersonCanvas {...current} snapshot={controllerSnapshot(current.controller)} />);
    await submitFrame(renderer, 2);
    expect(scene.getObjectByName('remembered-entry-landmark')!.children.map((object) => object.matrixWorld.toArray())).toEqual(remembered);
    expect(scene.getObjectByName('emblem-latch')!.position.x).toBeCloseTo(EMBLEM_LATCH.center.x + EMBLEM_LATCH.travel);
    const answer = createSealStimulus(current.controller.runtime.emblem.seed).answer;
    const winning = EMBLEM_SWITCHES.find((item) => item.glyph === answer)!;
    expect(scene.getObjectByName('emblem-switch-' + answer)!.position.z).toBeCloseTo(winning.center.z - EMBLEM_SWITCH_TRAVEL);
    expect(scene.getObjectByName('frame-seal-a-door')!.position.y).toBe(0);
    expect(scene.getObjectByName('frame-exit-door')).toBeDefined();
    expect(isSafePose({ position: { x: 0, y: 1.6, z: -8.02 }, yaw: 0, pitch: 0 }, getWorld(current.controller.runtime))).toBe(true);
    expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
    expect(current.onError).not.toHaveBeenCalled();
    await view.unmount();
  });

  it.each([false, true])('returns the actual wrong glyph without frame React updates (Reduce Motion %s)', async (reducedMotion) => {
    const controller = createController();
    controller.runtime.pose = { position: { x: 1.95, y: 1.6, z: -5.7 }, yaw: 0, pitch: 0.1 };
    const current = { ...props(), controller, snapshot: controllerSnapshot(controller), reducedMotion };
    const view = await render(<FirstPersonCanvas {...current} />);
    try {
      await createNativeContext(view);
      await submitFrame(renderer);
      expect(interactController(controller, 'emblem-panel')).toBe(true);
      const wrong = EMBLEM_SWITCHES.find((item) => item.glyph !== createSealStimulus(controller.runtime.emblem.seed).answer)!;
      const dx = wrong.center.x - controller.runtime.pose.position.x;
      const dy = wrong.center.y - controller.runtime.pose.position.y;
      const dz = wrong.center.z - controller.runtime.pose.position.z;
      commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) - controller.runtime.pose.pitch });
      const state = rendererRoot(renderer).store.getState();
      syncCamera(controller, state.camera as THREE.PerspectiveCamera);
      expect(interactController(controller, wrong.id)).toBe(true);
      const mesh = state.scene.getObjectByName('emblem-switch-' + wrong.glyph)!;
      const surface = (resourceFactory.mock.results[0]!.value as ReturnType<typeof createSceneResources>).emblemSurface!;
      const textures = surface.textures;
      const material = surface.material;
      const rendersBefore = chapterScene.mock.calls.length;
      const elapsed = jest.spyOn(state.clock, 'getDelta').mockReturnValue(0);
      await submitFrame(renderer, 2);
      expect(mesh.position.z).toBeCloseTo(wrong.center.z - EMBLEM_SWITCH_TRAVEL);
      elapsed.mockReturnValue(0.05);
      await submitFrame(renderer, 3);
      await submitFrame(renderer, 4);
      expect(mesh.position.z).toBeCloseTo(wrong.center.z - EMBLEM_SWITCH_TRAVEL * (reducedMotion ? 1 : 5 / 7));
      await submitFrame(renderer, 5);
      await submitFrame(renderer, 6);
      expect(mesh.position.z).toBeCloseTo(wrong.center.z - EMBLEM_SWITCH_TRAVEL * (reducedMotion ? 0 : 3 / 7));
      await submitFrame(renderer, 7);
      await submitFrame(renderer, 8);
      await submitFrame(renderer, 9);
      expect(mesh.position.z).toBeCloseTo(wrong.center.z);
      // Expire beyond the decimal-sum boundary (7 * 0.05 rounds just below 0.35).
      await submitFrame(renderer, 10);
      expect(controller.runtime.switchFeedback).toBeUndefined();
      expect(controller.runtime.progress.sealA).toBe(false);
      expect(controller.runtime.emblem.attempts).toBe(1);
      expect(chapterScene).toHaveBeenCalledTimes(rendersBefore);
      expect(resourceFactory).toHaveBeenCalledTimes(1);
      expect(surface.material).toBe(material);
      expect(surface.textures).toEqual(textures);
      expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
      expect(current.onError).not.toHaveBeenCalled();
    } finally {
      await view.unmount();
    }
  });

  it('keeps actual R3F emblem geometry/material/context stable across comparison, guide and palette updates', async () => {
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    await submitFrame(renderer);
    const scene = rendererRoot(renderer).store.getState().scene;
    const plate = scene.getObjectByName('emblem-plate') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    const original = { geometry: plate.geometry, material: plate.material, matrix: plate.matrixWorld.toArray(), color: plate.material.map };
    const surface = (resourceFactory.mock.results[0]!.value as ReturnType<typeof createSceneResources>).emblemSurface!;
    const originalMaskKey = surface.stimulus.geometryKey;
    for (const appearance of [
      { presentation: 'neutral' as const, assist: false, palette: 'baseline' as const },
      { presentation: 'color' as const, assist: true, palette: 'alternate' as const },
      { presentation: 'neutral' as const, assist: true, palette: 'muted' as const },
      { presentation: 'color' as const, assist: false, palette: 'baseline' as const },
    ]) {
      current.controller.runtime = { ...current.controller.runtime, emblem: { ...current.controller.runtime.emblem, presentation: appearance.presentation, assist: appearance.assist } };
      await view.rerender(<FirstPersonCanvas {...current} snapshot={controllerSnapshot(current.controller)} emblemPalette={appearance.palette} reducedMotion={appearance.assist} />);
      await submitFrame(renderer, 2);
      expect(scene.getObjectByName('emblem-plate')).toBe(plate);
      expect(plate.geometry).toBe(original.geometry);
      expect(plate.material).toBe(original.material);
      expect(plate.matrixWorld.toArray()).toEqual(original.matrix);
      expect(surface.stimulus.geometryKey).toBe(originalMaskKey);
      expect(plate.material).toMatchObject({ opacity: 1, transparent: false, depthTest: true, depthWrite: true, toneMapped: false, fog: false });
      expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
      expect(resourceFactory).toHaveBeenCalledTimes(1);
    }
    expect(plate.material.map).toBe(original.color);
    const disposed = surface.textures.map((texture) => { const fn = jest.fn(); texture.addEventListener('dispose', fn); return fn; });
    await view.unmount();
    expect(disposed.every((fn) => fn.mock.calls.length === 1)).toBe(true);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('publishes a presented aim cue after an explicit turn even inside the same compass and target bucket', async () => {
    const current = props();
    // Close to the plate but looking above its rectangular acquisition area.
    current.controller.runtime = { ...current.controller.runtime, pose: { position: { x: 1.95, y: 1.6, z: -5.7 }, yaw: 0, pitch: 0.6 } };
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    await submitFrame(renderer);
    await submitFrame(renderer, 2);
    const publish = jest.mocked(current.onSnapshot);
    expect(publish).toHaveBeenCalledTimes(1);
    const before = publish.mock.calls[0]![0];
    expect(before.cue).toMatchObject({ kind: 'aim', target: { id: 'emblem-panel' } });
    expect(before.direction).toBe('北');
    // Overshoot below the plate: still 'aim' and north, but the instruction
    // now needs the opposite pitch correction. Screen publishes this command
    // immediately, before the real camera matrices have caught up.
    commandController(current.controller, { type: 'turn', yaw: 0, pitch: -0.9 });
    const command = controllerSnapshot(current.controller);
    expect(command.cue.kind).toBe('none');
    current.onSnapshot(command);
    await submitFrame(renderer, 3);
    expect(publish).toHaveBeenCalledTimes(3);
    const presented = publish.mock.calls[2]![0];
    expect(presented.cue).toMatchObject({ kind: 'aim', target: { id: 'emblem-panel' } });
    expect(presented.direction).toBe(before.direction);
    expect(presented.runtime.pose.pitch).toBeCloseTo(-0.3);
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

  it.each(['render', 'scene frame'] as const)('rolls back unpresented walking/switch return when %s fails, preserving prior emblem observation', async (phase) => {
    const controller = createController();
    controller.runtime.pose = { position: { x: 1.95, y: 1.6, z: -5.7 }, yaw: 0, pitch: 0.1 };
    const current = { ...props(), controller, snapshot: controllerSnapshot(controller) };
    const original = new Error('Injected fault during switch return');
    let frameShouldFail = false;
    let candidateRemaining = Number.POSITIVE_INFINITY;
    const ActualChapterScene = jest.requireActual('../ChapterScene').ChapterScene as typeof ChapterScene;
    chapterScene.mockImplementation(function FaultingScene(sceneProps: ComponentProps<typeof ChapterScene>) {
      useFrame(() => {
        if (frameShouldFail && phase === 'scene frame') {
          candidateRemaining = controller.runtime.switchFeedback?.remainingSeconds ?? 0;
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
      expect(interactController(controller, 'emblem-panel')).toBe(true);
      expect(dispatchEmblemController(controller, createEmblemCommand(controller, { type: 'compare' })).accepted).toBe(true);
      commandController(controller, { type: 'hint', stage: 1 });
      commandController(controller, { type: 'hint', stage: 2 });
      const wrong = EMBLEM_SWITCHES.find((item) => item.glyph !== createSealStimulus(controller.runtime.emblem.seed).answer)!;
      const dx = wrong.center.x - controller.runtime.pose.position.x;
      const dy = wrong.center.y - controller.runtime.pose.position.y;
      const dz = wrong.center.z - controller.runtime.pose.position.z;
      commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) - controller.runtime.pose.pitch });
      syncCamera(controller, rendererRoot(renderer).store.getState().camera as THREE.PerspectiveCamera);
      expect(interactController(controller, wrong.id)).toBe(true);
      const before = controller.runtime;
      expect(before.emblem).toMatchObject({ phase: 'observing', compared: true, presentation: 'neutral', hintTier: 2 });
      expect(before.switchFeedback!.remainingSeconds).toBeGreaterThan(0);
      // Drive the installed R3F callback with deterministic elapsed time;
      // its always-loop clock otherwise sees no time under Jest fake timers.
      jest.spyOn(rendererRoot(renderer).store.getState().clock, 'getDelta').mockReturnValue(0.05);
      frameShouldFail = true;
      if (phase === 'render') renderer.draw.mockImplementation(() => { candidateRemaining = controller.runtime.switchFeedback?.remainingSeconds ?? 0; throw original; });
      commandController(controller, { type: 'step', forward: -1 });
      await submitFrame(renderer, 2);
      expect(candidateRemaining).toBeLessThan(before.switchFeedback!.remainingSeconds);
      expect(controller.runtime.pose).toEqual(before.pose);
      expect(controller.runtime.progress).toEqual(before.progress);
      expect(controller.runtime.emblem).toEqual({ ...before.emblem, paused: true });
      expect(controller.runtime.switchFeedback).toEqual(before.switchFeedback);
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

  it.each(['render', 'presentation'] as const)('rolls back movement and look tutorial milestones when %s fails', async (phase) => {
    const current = props();
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view);
    await submitFrame(renderer);
    commandController(current.controller, { type: 'step', forward: 1 });
    await submitFrame(renderer, 2);
    expect(current.controller.tutorial.milestones.moved).toBe(false);
    const before = { ...current.controller.tutorial };
    let candidate: typeof before.milestones | undefined;
    const fail = () => {
      candidate = current.controller.tutorial.milestones;
      throw new Error('Injected tutorial presentation fault');
    };
    if (phase === 'render') renderer.draw.mockImplementation(fail);
    else deviceContext.endFrameEXP.mockImplementation(fail);
    commandController(current.controller, { type: 'step', forward: 1 });
    current.controller.input.lookX = 100;
    const publishedBefore = jest.mocked(current.onSnapshot).mock.calls.length;
    await submitFrame(renderer, 3);
    expect(candidate).toMatchObject({ moved: true, looked: true });
    expect(current.controller.tutorial).toEqual(before);
    expect(current.controller.runtime.paused).toBe(true);
    expect(current.onSnapshot).toHaveBeenCalledTimes(publishedBefore);
    expect(current.onError).toHaveBeenCalledTimes(1);
    await view.unmount();
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
  it('keeps the same native renderer across input, notices, hints, mode, handedness and large text changes', async () => {
    const originalDimensions = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
    const screenProps = { settings: DEFAULT_SETTINGS, controls: DEFAULT_FIRST_PERSON_CONTROLS, preferredColor: 'neutral' as const, onSettingsChange: jest.fn(), onControlsChange: jest.fn(), onCheckpoint: jest.fn(), onComplete: jest.fn(), onRestart: jest.fn(), onExit: jest.fn() };
    const view = await render(<FirstPersonScreen {...screenProps} />);
    try {
      await createNativeContext(view);
      await submitFrame(renderer);
      expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
      const state = rendererRoot(renderer).store.getState();
      const input = chapterScene.mock.calls.at(-1)![0].runtime.current;
      input.pose = { position: { x: 1.95, y: 1.6, z: -5.7 }, yaw: 0, pitch: 0.1 };
      await submitFrame(renderer, 1.016);
      expect(view.getByRole('button', { name: '色をほどく' })).toBeEnabled();
      await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
      expect(chapterScene.mock.calls.at(-1)![0].runtime.current.emblem.presentation).toBe('neutral');
      await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
      await fireEvent.press(view.getByRole('button', { name: 'ヒント' }));
      await fireEvent.press(view.getByRole('button', { name: '探索へ戻る' }));
      await view.rerender(<FirstPersonScreen {...screenProps} controls={{ ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' }} />);
      expect(view.getByRole('button', { name: '前へ一歩' })).toBeTruthy();
      await view.rerender(<FirstPersonScreen {...screenProps} controls={{ ...DEFAULT_FIRST_PERSON_CONTROLS, handedness: 'left' }} settings={{ ...DEFAULT_SETTINGS, reducedMotion: true }} />);
      await act(() => Dimensions.set({ window: { width: 320, height: 568, scale: 2, fontScale: 2 }, screen: { width: 320, height: 568, scale: 2, fontScale: 2 } }));
      const point = { identifier: 77, pageX: 200, pageY: 300 };
      await fireEvent(view.getByTestId('movement-stick'), 'touchStart', { nativeEvent: { changedTouches: [point], targetTouches: [point] } });
      await fireEvent(view.getByTestId('movement-stick'), 'touchMove', { nativeEvent: { changedTouches: [{ ...point, pageY: 250 }] } });
      await submitFrame(renderer, 1.016);
      expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
      await view.rerender(<FirstPersonScreen {...screenProps} settings={{ ...DEFAULT_SETTINGS, audio: { enabled: false, musicVolume: 0, effectsVolume: .1 } }} />);
      expect(rendererRoot(renderer).store.getState().gl).toBe(state.gl);
      expect(renderer.dispose).not.toHaveBeenCalled();
      expect(chapterScene.mock.calls.at(-1)![0].runtime.current.progress.sealA).toBe(input.progress.sealA);
    } finally {
      await view.unmount();
      await act(() => Dimensions.set(originalDimensions));
    }
  });

  it('mounts gallery through the actual native R3F boundary, preserving camera and geometry while B/C are manipulated', async () => {
    const c = createController(undefined, false, true, GALLERY_CHAPTER_ID);
    c.runtime.pose = GALLERY_SHADOW_OBSERVATION_POSE;
    const current = { ...props(), controller: c, snapshot: controllerSnapshot(c) };
    const view = await render(<FirstPersonCanvas {...current} />);
    await createNativeContext(view); await submitFrame(renderer);
    const state = rendererRoot(renderer).store.getState(), initialCamera = state.camera;
    const scene = state.scene, panel = scene.getObjectByName('shadow-plate') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(panel).toBeInstanceOf(THREE.Mesh);
    const map = panel.material.map, samples = ['a', 'b', 'c'].map(id => scene.getObjectByName('sample-' + id + '-interior') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>);
    const materials = samples.map(s => s.material), colors = materials.map(m => m.color.getHexString());
    expect(samples.every(s => s.geometry === samples[0]!.geometry)).toBe(true);
    expect(materials.every(m => !m.toneMapped && !m.fog && !m.transparent)).toBe(true);
    expect(galleryAction(c, { type: 'enter', puzzle: 'shadow' })).toBe(true);
    expect(galleryAction(c, { type: 'compare' })).toBe(true);
    await submitFrame(renderer, 1.016);
    expect(panel.material.map).not.toBe(map);
    expect(panel.material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(samples.map(s => s.material.color.getHexString())).toEqual(colors);
    expect(samples.map(s => s.material)).toEqual(materials);
    expect(galleryAction(c, { type: 'leave' })).toBe(true);
    c.runtime.pose = GALLERY_CONTOUR_OBSERVATION_POSE; syncCamera(c, initialCamera as THREE.PerspectiveCamera);
    expect(galleryAction(c, { type: 'enter', puzzle: 'contour' })).toBe(true);
    const contour = createContourSpec(c.runtime.progress.gallery!.contour.seed);
    for (const disc of contour.discs) galleryAction(c, { type: 'contour-adjust', discId: disc.id, delta: normalizeAngle(disc.targetAngle - c.runtime.gallery!.contourAngles[disc.id]) });
    await submitFrame(renderer, 1.032);
    const inducingMeshes = contour.discs.map(d => scene.getObjectByName('contour-disc-' + d.id) as THREE.Mesh);
    expect(inducingMeshes.map(m => m.rotation.z)).toEqual(c.runtime.gallery!.contourAngles);
    expect(inducingMeshes.every(m => m.geometry === inducingMeshes[0]!.geometry)).toBe(true);
    const notches = contour.discs.map(d => scene.getObjectByName('contour-notch-' + d.id) as THREE.Mesh);
    for (const d of contour.discs) {
      const offset = notches[d.id]!.position;
      expect(offset.x * Math.cos(d.targetAngle) + offset.y * Math.sin(d.targetAngle)).toBeLessThan(-d.radius);
    }
    expect(scene.getObjectByName('contour-guide-only')!.visible).toBe(false);
    const collisionMeshes = [...inducingMeshes, ...notches];
    // Raycast the genuine transformed GPU geometries throughout the central
    // triangle, away from the boundary. Neither fill nor external notches hit.
    for (let a = 1; a < 10; a++) for (let b = 1; b < 10 - a; b++) {
      const weights = [a / 10, b / 10, 1 - (a + b) / 10];
      const x = contour.discs.reduce((sum, d, i) => sum + d.center.x * weights[i]!, 0);
      const y = contour.discs.reduce((sum, d, i) => sum + d.center.y * weights[i]!, 0);
      const ray = new THREE.Raycaster(new THREE.Vector3(GALLERY_CONTOUR_FIXTURE.center.x + x, GALLERY_CONTOUR_FIXTURE.center.y + y, -14), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObjects(collisionMeshes)).toHaveLength(0);
    }
    expect(c.runtime.progress.gallery!.contour.solved).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    galleryAction(c, { type: 'guide', enabled: true });
    await submitFrame(renderer, 1.048);
    expect(scene.getObjectByName('contour-guide-only')!.visible).toBe(true);
    await view.rerender(<FirstPersonCanvas {...current} snapshot={controllerSnapshot(c)} paused />);
    await view.rerender(<FirstPersonCanvas {...current} snapshot={controllerSnapshot(c)} assist={false} reducedMotion={false} />);
    expect(rendererRoot(renderer).store.getState().camera).toBe(initialCamera);
    expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(current.onError).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('releases every gallery native root/context owner and scene resource on ten reentries (device GPU excluded)', async () => {
    const rootsBefore = _roots.size;
    for (let replay = 0; replay < 10; replay++) {
      renderer = fakeRenderer();
      const c = createController(undefined, false, true, GALLERY_CHAPTER_ID), current = { ...props(), controller: c, snapshot: controllerSnapshot(c) };
      const view = await render(<FirstPersonCanvas {...current} />);
      await createNativeContext(view); await submitFrame(renderer);
      const scene = rendererRoot(renderer).store.getState().scene;
      const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        resources.add(object.geometry);
        for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
          resources.add(m);
          for (const value of Object.values(m)) if (value instanceof THREE.Texture) resources.add(value);
        }
      });
      const counts = new Map<object, number>();
      for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1));
      expect(resources.size).toBeGreaterThan(20);
      await view.unmount();
      await act(async () => { await jest.advanceTimersByTimeAsync(600); });
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      expect(_roots.size).toBe(rootsBefore);
      expect(counts.size).toBe(resources.size);
      expect([...counts.values()].every(n => n === 1)).toBe(true);
      expect(c.runtime.paused).toBe(true);
    }
    expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(10);
  }, 30000);

  it.each(['render', 'presentation'] as const)('rolls back unpresented actor travel and suppresses its audio/subtitle when %s fails', async (phase) => {
    const controller = createController(undefined, false, true, GALLERY_CHAPTER_ID);
    const g = controller.runtime.progress.gallery!;
    Object.assign(g, { emergencyLit: true, exitInspected: true, powerTaken: { shadow: true, contour: true }, powerConnected: true,
      story: { foreshadowed: true, absence: true, serviceWarned: true, resolved: false } });
    controller.runtime.pose = { position: { x: 0, y: 1.6, z: 7 }, yaw: Math.PI, pitch: 0 };
    controller.runtime.gallery!.serviceDoorOpen = 1;
    Object.assign(controller.runtime.gallery!.actor, { position: { x: 4, y: 0, z: 14 }, phase: 'patrol', routeIndex: 3, startupGrace: 0, contactCooldown: 0, visible: true });
    const audio = { event: jest.fn(), dispose: jest.fn(), setActive: jest.fn(), updatePreferences: jest.fn(), movement: jest.fn(), actorMovement: jest.fn(), stopMovement: jest.fn(), setListenerPosition: jest.fn(), whenReady: jest.fn().mockResolvedValue(undefined), getDiagnostics: jest.fn() };
    controller.audio = audio;
    const current = { ...props(), controller, snapshot: controllerSnapshot(controller) };
    const view = await render(<FirstPersonCanvas {...current} />);
    try {
      await createNativeContext(view); await submitFrame(renderer);
      const before = structuredClone(controller.runtime.gallery!.actor);
      jest.spyOn(rendererRoot(renderer).store.getState().clock, 'getDelta').mockReturnValue(.05);
      let candidateTravel = 0;
      const fail = () => { candidateTravel = controller.runtime.gallery!.actor.travelledDistance; throw new Error('Injected actor frame fault'); };
      if (phase === 'render') renderer.draw.mockImplementation(fail); else deviceContext.endFrameEXP.mockImplementation(fail);
      await submitFrame(renderer, 2);
      expect(candidateTravel).toBeGreaterThan(before.travelledDistance);
      expect(controller.runtime.gallery!.actor).toEqual(before);
      expect(controller.runtime.paused).toBe(true);
      expect(controller.pendingActorFootstepDistance).toBe(0); expect(controller.pendingActorEvents).toEqual([]);
      expect(controller.actorNotice).toBeUndefined(); expect(audio.actorMovement).not.toHaveBeenCalled();
      expect(audio.setActive).toHaveBeenCalledWith(false);
      expect(current.onSnapshot).not.toHaveBeenCalled(); expect(current.onError).toHaveBeenCalledTimes(1);
    } finally { await view.unmount(); }
  });

});
