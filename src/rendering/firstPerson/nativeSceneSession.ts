import type { RootState } from '@react-three/fiber/native';
import * as THREE from 'three';

import type { ChapterRuntime } from '../../domain/firstPerson/types';
import { configureNotebookCamera } from './notebookCamera';
import type { CanvasLifecycle } from './canvasLifecycle';
import { installShaderDiagnostics, recordContextDiagnostics, recordDiagnosticEvent, recordFailureFrameContext, sampleGlDiagnostics, sampleRendererDiagnostics } from './diagnostics';
import { memoizeNativeRenderer, observeNativeContext } from './nativeRendererFactory';
import { PROOF_CAMERA } from './ProofScene';
import { advanceController, flushControllerAudioFrame, controllerSnapshot, recordFrameStats, stopController } from './runtimeController';
import { syncCamera, worldForController } from './controllerContext';
import type { RuntimeController, RuntimeSnapshot } from './controllerTypes';

function createTeardownOnlyRenderer() {
  return { render() {}, setSize() {}, setPixelRatio() {}, dispose() {}, getContext: () => ({ endFrameEXP() {} }) };
}

/** Imperative session owned by a single React Canvas mount. All frame counters
 * live here/in the controller; React only receives discrete presented snapshots. */
export function createNativeSceneSession(controller: RuntimeController, lifecycle: CanvasLifecycle, proof: boolean, onReady: () => void) {
  const diagnostics = controller.diagnostics;
  // A CPU camera used only for explicit notebook inspection, in the same GL owner.
  const notebookCamera = new THREE.PerspectiveCamera(38, 1, .05, 10);
  const previewing = () => !!controller.notebookPreview && controller.runtime.paused && lifecycle.ready;
  let lastDelta = 0;
  let lastSample = -Infinity;
  let lastGlCheck = -Infinity;
  let lastKey = '';
  let cleanupShader: (() => void) | undefined;
  let pendingPublish: ((snapshot: RuntimeSnapshot) => void) | undefined;
  let previousRuntime: ChapterRuntime | undefined;
  let previousTutorial: RuntimeController['tutorial'] | undefined;
  let adapterCanvas: object | undefined;
  let checkPresentation = false;
  // The installed native wrapper calls endFrameEXP whenever its render
  // delegate returns. An inner shader/GL failure must escape that wrapper.
  const rejectedFrame = Symbol('native frame rejected before presentation');
  let rawDraw: ((scene: THREE.Scene, camera: THREE.Camera) => void) | undefined;
  let offscreenRenderer: THREE.WebGLRenderer | undefined;
  const fail = (error: unknown, phase: Parameters<CanvasLifecycle['fail']>[1]) => {
    recordFailureFrameContext(diagnostics, controller.runtime.pose, controller.viewCommandRevision);
    // Do not retain an automatic puzzle transition from a frame that failed.
    if (previousRuntime) { controller.runtime = previousRuntime; previousRuntime = undefined; }
    if (previousTutorial) { controller.tutorial = previousTutorial; previousTutorial = undefined; }
    pendingPublish = undefined;
    controller.pendingExitImpact = false; controller.pendingProjectorPulse = false; controller.pendingTheatreCues=[];
    controller.equipmentInvestigationSequence = undefined;
    controller.pendingFootstepDistance = 0; controller.pendingActorFootstepDistance = 0; controller.pendingActorPlants = []; controller.pendingActorEvents = [];
    controller.pendingStageSounds = [];
    controller.audio?.setActive(false);
    lifecycle.fail(error, phase);
  };
  const inspectGl = (renderer: THREE.WebGLRenderer, point: 'before native presentation' | 'after native wrapper return') => {
    const gl = renderer.getContext();
    sampleGlDiagnostics(diagnostics, gl);
    if (diagnostics.supportsWebGL2 === false || (typeof diagnostics.framebufferStatus === 'number' && diagnostics.framebufferStatus !== gl.FRAMEBUFFER_COMPLETE) ||
        diagnostics.glErrors.some((error) => error !== 'unsupported')) {
      fail(new Error('Invalid native GL frame ' + point + ': WebGL2=' + diagnostics.supportsWebGL2 + ', framebuffer=' + diagnostics.framebufferStatus + ', errors=' + diagnostics.glErrors.join(', ')), 'GL');
    }
  };
  const factory = memoizeNativeRenderer((defaults) => {
    try {
      if (adapterCanvas && adapterCanvas !== defaults.canvas) throw new Error('The native Canvas context was replaced. A fresh scene retry is required.');
      adapterCanvas = defaults.canvas;
      const renderer = observeNativeContext(defaults, (context) => {
        recordContextDiagnostics(diagnostics, context);
        diagnostics.stage = 'context-created';
        recordDiagnosticEvent(diagnostics, 'context-created');
      }, () => new THREE.WebGLRenderer({ ...defaults, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'low-power' }));
      if (!lifecycle.ownRenderer(renderer)) return createTeardownOnlyRenderer();
      cleanupShader?.();
      cleanupShader = installShaderDiagnostics(renderer, diagnostics, (error) => fail(error, 'shader'));
      const draw = renderer.render.bind(renderer);
      rawDraw = draw;
      offscreenRenderer = renderer;
      // One frame can contain the mirror pass and the native main pass.
      // Reset once before both so renderer.info reports their total cost.
      renderer.info.autoReset = false;
      // Native Canvas adds its presentation wrapper after this draw observer.
      renderer.render = (scene, camera) => {
        if (!lifecycle.isCurrentRenderer(renderer)) return;
        lifecycle.submitFrame();
        diagnostics.renderCalls += 1;
        draw(scene, camera);
        if (!lifecycle.active) throw rejectedFrame;
        if (diagnostics.renderReturns === 0) recordDiagnosticEvent(diagnostics, 'first-main-render');
        diagnostics.renderReturns += 1;
        diagnostics.lastMainRenderFrame = diagnostics.frameSequence;
        recordFrameStats(controller, lastDelta, renderer.info);
        const now = Date.now();
        checkPresentation = now - lastGlCheck >= (lifecycle.ready ? 1000 : 500);
        if (checkPresentation && lifecycle.active) {
          lastGlCheck = now;
          inspectGl(renderer, 'before native presentation');
          if (!lifecycle.active) throw rejectedFrame;
        }
      };
      return renderer;
    } catch (error) {
      diagnostics.rendererOwnership = 'teardown-only';
      fail(error, 'renderer initialization');
      // Finish supported configure/unmount only; never a playable fallback.
      return createTeardownOnlyRenderer();
    }
  });
  const sync = (state: RootState) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    camera.aspect = state.size.height > 0 ? state.size.width / state.size.height : 0;
    if (proof) {
      camera.position.set(...PROOF_CAMERA.position);
      camera.rotation.set(0, 0, 0, 'YXZ');
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    } else syncCamera(controller, camera);
  };
  return {
    factory,
    renderOffscreen(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
      if (renderer !== offscreenRenderer || !rawDraw || !lifecycle.isCurrentRenderer(renderer) || diagnostics.paused || diagnostics.appActive === false)
        throw new Error('Offscreen render has no live native Canvas owner');
      const target = renderer.getRenderTarget();
      if (!target) throw new Error('Offscreen draw has no render target');
      diagnostics.offscreenTargetConfig = { width: target.width, height: target.height, samples: target.samples,
        depthBuffer: target.depthBuffer, stencilBuffer: target.stencilBuffer,
        type: target.texture.type, format: target.texture.format };
      if (diagnostics.offscreenPasses === 0) {
        const gl = renderer.getContext();
        diagnostics.offscreenFramebufferStatus = typeof gl.checkFramebufferStatus === 'function' && typeof gl.FRAMEBUFFER === 'number'
          ? gl.checkFramebufferStatus(gl.FRAMEBUFFER) : 'unsupported';
        if (typeof diagnostics.offscreenFramebufferStatus === 'number' && diagnostics.offscreenFramebufferStatus !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error(`Mirror framebuffer incomplete: 0x${diagnostics.offscreenFramebufferStatus.toString(16)}`);
      }
      rawDraw(scene, camera);
      if (!lifecycle.active) throw rejectedFrame;
      if (diagnostics.offscreenPasses === 0) recordDiagnosticEvent(diagnostics, 'first-reflection-render');
      diagnostics.offscreenPasses += 1;
      diagnostics.frameOffscreenPasses += 1;
      diagnostics.offscreenTargetSize = [width, height];
      diagnostics.lastOffscreenFrame = diagnostics.frameSequence;
    },
    close() { cleanupShader?.(); lifecycle.close(); },
    sceneError(error: unknown) { fail(error, 'scene frame'); },
    step(state: RootState, delta: number, publish: (snapshot: RuntimeSnapshot) => void) {
      if (!lifecycle.isCurrentRenderer(state.gl) || diagnostics.appActive === false) return;
      if (previewing()) {
        configureNotebookCamera(notebookCamera, state.size.width, state.size.height, controller.notebookPreview!);
        return;
      }
      if (diagnostics.paused) return;
      diagnostics.frameSequence += 1;
      diagnostics.frameCallbacks += 1;
      diagnostics.frameOffscreenPasses = 0;
      if (typeof state.gl.info?.reset === 'function') state.gl.info.reset();
      lastDelta = delta;
      try {
        sync(state);
        if (!lifecycle.ready || proof) { stopController(controller); return; }
        previousRuntime = controller.runtime;
        previousTutorial = { ...controller.tutorial };
        diagnostics.simulationTicks += 1;
        advanceController(controller, delta, state.camera as THREE.PerspectiveCamera);
        // Publish only after the same frame's native wrapper returns.
        pendingPublish = publish;
      } catch (error) { fail(error, 'simulation frame'); }
    },
    created(state: RootState) {
      if (!lifecycle.attachRoot(state)) return;
      try {
        const renderer = state.gl;
        const present = renderer.render.bind(renderer);
        renderer.render = (scene, camera) => {
          if (!lifecycle.isCurrentRenderer(renderer) || diagnostics.appActive === false || diagnostics.paused && !previewing()) return;
          const completedBefore = diagnostics.renderReturns;
          try {
            // This is the installed native render+endFrameEXP wrapper, once.
            present(scene, previewing() ? notebookCamera : camera);
            if (!lifecycle.active) return;
            if (previewing()) {
              if (checkPresentation) { checkPresentation = false; inspectGl(renderer, 'after native wrapper return'); }
              if (lifecycle.active) {
                diagnostics.presentationReturns += 1;
                diagnostics.lastPresentationFrame = diagnostics.frameSequence;
              }
              // No simulation, story, input, ready promotion or game snapshot from a note.
              return;
            }
            const now = Date.now();
            const sampledFrame = !lifecycle.ready ? checkPresentation : now - lastSample >= (diagnostics.open ? 500 : 1000);
            if (sampledFrame) {
              lastSample = now;
              // Keep RN onLayout authoritative. R3F deliberately skips a
              // zero-size configure and can retain an earlier positive size.
              const gl = renderer.getContext();
              diagnostics.drawingBuffer = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
              sampleRendererDiagnostics(diagnostics, renderer, scene as THREE.Scene, camera as THREE.PerspectiveCamera,
                proof ? undefined : worldForController(controller), proof ? undefined : controller.runtime.pose);
            }
            // Separate submitted-draw errors from errors after native blitting.
            // First attempt is immediate, then at most 2 Hz during startup and
            // 1 Hz in play. A blank startup must not poll synchronous GL at FPS.
            if (checkPresentation) {
              checkPresentation = false;
              inspectGl(renderer, 'after native wrapper return');
              if (!lifecycle.active) return;
            }
            if (diagnostics.presentationReturns === 0) recordDiagnosticEvent(diagnostics, 'first-native-presentation');
            diagnostics.presentationReturns += 1;
            diagnostics.lastPresentationFrame = diagnostics.frameSequence;
            const dimensions = diagnostics.rnLayout;
            const buffer = diagnostics.drawingBuffer;
            const cameraData = diagnostics.camera;
            const viewport = diagnostics.viewport;
            const gates = {
              frame: diagnostics.frameSequence, sampled: sampledFrame,
              layout: typeof dimensions === 'object' && dimensions.width > 0 && dimensions.height > 0,
              drawingBuffer: typeof buffer === 'object' && buffer.width > 0 && buffer.height > 0,
              camera: typeof cameraData === 'object' && cameraData.valid,
              viewport: Array.isArray(viewport) && viewport[2] > 0 && viewport[3] > 0,
              sceneDensity: diagnostics.scene.meshes >= (proof ? 3 : controller.lab ? 10 : 20),
              frustum: diagnostics.scene.frustumCandidateMeshes > 0,
              draw: typeof diagnostics.lastFrame.drawCalls === 'number' && diagnostics.lastFrame.drawCalls > 0,
              target: diagnostics.renderTarget === 'default-framebuffer',
              pose: proof || diagnostics.pose.safe === true,
              shader: diagnostics.shaderErrors.length === 0,
            };
            const valid = gates.sampled && gates.layout && gates.drawingBuffer && gates.camera && gates.viewport &&
              gates.sceneDensity && gates.frustum && gates.draw && gates.target && gates.pose && gates.shader;
            if (!lifecycle.ready && sampledFrame) diagnostics.readiness = { ...gates, valid };
            if (lifecycle.markReady(valid && sampledFrame)) onReady();
            if (lifecycle.ready && pendingPublish) {
              flushControllerAudioFrame(controller);
              const next = controllerSnapshot(controller);
              if (next.key !== lastKey) { lastKey = next.key; pendingPublish(next); }
            }
            previousRuntime = undefined;
            previousTutorial = undefined;
            pendingPublish = undefined;
          } catch (error) {
            if (error !== rejectedFrame) fail(error, diagnostics.renderReturns > completedBefore ? 'presentation' : 'render');
          }
        };
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setClearColor('#354342', 1);
        sync(state);
        // Initialization only: commitment and a real frame gate readiness.
      } catch (error) { fail(error, 'scene initialization'); }
    },
  };
}
export type NativeSceneSession = ReturnType<typeof createNativeSceneSession>;
