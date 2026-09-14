import type { RootState } from '@react-three/fiber/native';
import type * as THREE from 'three';

import { recordDiagnosticEvent, recordFirstFailure } from './diagnostics';
import { commandController, retireController } from './runtimeController';
import type { RuntimeController } from './controllerTypes';

type FailurePhase = 'renderer initialization' | 'scene initialization' | 'scene mount' | 'simulation frame' | 'scene frame' | 'render' | 'presentation' | 'shader' | 'GL' | 'initialization timeout';
const FAILURE_MESSAGE = '部屋の描画を確認できませんでした。再試行するか、ホームへ戻ってください。';
const FAILURE_CODES: Record<FailurePhase, string> = {
  'renderer initialization': 'RENDERER_INIT', 'scene initialization': 'SCENE_INIT', 'scene mount': 'SCENE_MOUNT',
  'simulation frame': 'SIMULATION_FRAME', 'scene frame': 'SCENE_FRAME', render: 'MAIN_RENDER', presentation: 'NATIVE_PRESENTATION',
  shader: 'SHADER', GL: 'GL_FRAME', 'initialization timeout': 'STARTUP_TIMEOUT',
};
let activeRendererOwners = 0;

/** One native Canvas visit owns one renderer and one startup/failure latch.
 * Scene commitment and a completed native frame are separate from onCreated. */
export function createCanvasLifecycle(controller: RuntimeController, onError: (message: string) => void) {
  const diagnostics = controller.diagnostics;
  let failed = false;
  let closed = false;
  let ready = false;
  let initialized = false;
  let root: Pick<RootState, 'setFrameloop'> | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let errorPending = false;
  const publishFailure = () => {
    if (!errorPending || closed) return;
    errorPending = false;
    onError(FAILURE_MESSAGE);
  };
  const stop = () => {
    commandController(controller, { type: 'pause' });
    diagnostics.paused = true;
    root?.setFrameloop('never');
  };
  return {
    get active() { return !failed && !closed; },
    get ready() { return ready && !failed && !closed; },
    isCurrentRenderer(value: THREE.WebGLRenderer) { return renderer === value && !failed && !closed; },
    ownRenderer(value: THREE.WebGLRenderer) {
      if (closed || failed) { value.dispose(); return false; }
      if (renderer && renderer !== value) renderer.dispose();
      if (!renderer) activeRendererOwners += 1;
      renderer = value;
      initialized = false;
      ready = false;
      diagnostics.rendererCreates += 1;
      diagnostics.activeRendererOwners = activeRendererOwners;
      diagnostics.rendererOwnership = 'live';
      diagnostics.stage = 'renderer-created';
      recordDiagnosticEvent(diagnostics, 'renderer-created');
      return true;
    },
    attachRoot(value: Pick<RootState, 'setFrameloop'>) {
      if (closed || failed) {
        value.setFrameloop('never');
        // Finish configure before publishing constructor failure, so normal
        // R3F unmount has a defined Scene to dispose (Goal 003.1 regression).
        publishFailure();
        return false;
      }
      root = value;
      initialized = true;
      recordDiagnosticEvent(diagnostics, 'root-attached');
      if (diagnostics.sceneCommitted) diagnostics.stage = 'scene-committed';
      return true;
    },
    commitScene() {
      if (closed || failed) return;
      diagnostics.sceneCommitted = true;
      diagnostics.stage = 'scene-committed';
      recordDiagnosticEvent(diagnostics, 'scene-committed');
    },
    submitFrame() {
      if (!ready && !failed && !closed) diagnostics.stage = 'first-submitted';
    },
    markReady(validFrame = false) {
      if (ready || failed || closed || !initialized || !diagnostics.sceneCommitted ||
          diagnostics.rendererOwnership !== 'live' || !validFrame ||
          diagnostics.renderReturns < 1 || diagnostics.presentationReturns < 1) return false;
      ready = true;
      diagnostics.stage = 'ready';
      diagnostics.readyAtMs = Math.max(0, Date.now() - diagnostics.startedAtMs);
      if (typeof diagnostics.startupTimeoutMs === 'number')
        diagnostics.startupRemainingMs = Math.max(0, diagnostics.startupTimeoutMs - diagnostics.readyAtMs);
      recordDiagnosticEvent(diagnostics, 'ready');
      return true;
    },
    fail(error: unknown, phase: FailurePhase, componentStack?: string | null) {
      if (closed) return;
      if (failed) {
        if (phase !== 'renderer initialization') publishFailure();
        return;
      }
      failed = true;
      ready = false;
      errorPending = true;
      recordFirstFailure(diagnostics, error, phase, FAILURE_CODES[phase], componentStack);
      diagnostics.stage = 'failed';
      stop();
      if (__DEV__) console.error('[CHROMA RIFT 3D: ' + phase + ']', error, componentStack ?? '');
      if (phase !== 'renderer initialization') publishFailure();
    },
    close() {
      if (closed) return;
      closed = true;
      ready = false;
      // Preserve the last failure stage and evidence for the error view.
      if (!failed) diagnostics.stage = 'closed';
      diagnostics.rendererOwnership = 'closed';
      stop();
      retireController(controller);
      if (renderer) activeRendererOwners = Math.max(0, activeRendererOwners - 1);
      diagnostics.activeRendererOwners = activeRendererOwners;
      recordDiagnosticEvent(diagnostics, 'closed');
      renderer?.dispose();
      renderer = undefined;
      root = undefined;
    },
  };
}
export type CanvasLifecycle = ReturnType<typeof createCanvasLifecycle>;
