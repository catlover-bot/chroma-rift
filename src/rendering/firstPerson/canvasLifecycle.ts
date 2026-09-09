import type { RootState } from '@react-three/fiber/native';
import type * as THREE from 'three';

import { recordDiagnosticError } from './diagnostics';
import { commandController, retireController } from './runtimeController';
import type { RuntimeController } from './controllerTypes';

type FailurePhase = 'renderer initialization' | 'scene initialization' | 'scene mount' | 'simulation frame' | 'scene frame' | 'render' | 'presentation' | 'shader' | 'GL' | 'initialization timeout';
const FAILURE_MESSAGE = '部屋の描画を確認できませんでした。再試行するか、ホームへ戻ってください。';

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
      renderer = value;
      initialized = false;
      ready = false;
      diagnostics.rendererCreates += 1;
      diagnostics.rendererOwnership = 'live';
      diagnostics.stage = 'renderer-created';
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
      if (diagnostics.sceneCommitted) diagnostics.stage = 'scene-committed';
      return true;
    },
    commitScene() {
      if (closed || failed) return;
      diagnostics.sceneCommitted = true;
      diagnostics.stage = 'scene-committed';
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
      diagnostics.stage = 'failed';
      recordDiagnosticError(diagnostics, error, phase, componentStack);
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
      renderer?.dispose();
      renderer = undefined;
      root = undefined;
    },
  };
}
export type CanvasLifecycle = ReturnType<typeof createCanvasLifecycle>;
