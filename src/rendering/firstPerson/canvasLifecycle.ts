import type { RootState } from '@react-three/fiber/native';
import type * as THREE from 'three';

import { commandController, type RuntimeController } from './runtimeController';

type FailurePhase = 'renderer initialization' | 'scene initialization' | 'scene mount' | 'simulation frame' | 'scene frame' | 'render' | 'initialization timeout';
const FAILURE_MESSAGE = '3Dの描画を続けられませんでした。ホームに戻って開き直してください。';

/** One canvas mount owns one failure latch and renderer. Late native callbacks
 * cannot publish into a newer visit. R3F still owns its root and GL context. */
export function createCanvasLifecycle(controller: RuntimeController, onError: (message: string) => void) {
  let status: 'initializing' | 'ready' | 'failed' | 'closed' = 'initializing';
  let root: Pick<RootState, 'setFrameloop'> | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let errorPending = false;
  const publishFailure = () => {
    if (!errorPending || status === 'closed') return;
    errorPending = false;
    onError(FAILURE_MESSAGE);
  };
  const stop = () => {
    commandController(controller, { type: 'pause' });
    root?.setFrameloop('never');
  };
  return {
    get active() { return status === 'initializing' || status === 'ready'; },
    get ready() { return status === 'ready'; },
    ownRenderer(value: THREE.WebGLRenderer) {
      if (status === 'closed' || status === 'failed') { value.dispose(); return false; }
      if (renderer && renderer !== value) renderer.dispose();
      renderer = value;
      return true;
    },
    attachRoot(value: Pick<RootState, 'setFrameloop'>) {
      if (status === 'closed' || status === 'failed') {
        value.setFrameloop('never');
        // Constructor failure completes its teardown-only configure first.
        // Earlier publication would unmount R3F with an undefined scene.
        publishFailure();
        return false;
      }
      root = value;
      return true;
    },
    markReady() {
      if (status !== 'initializing') return false;
      status = 'ready';
      return true;
    },
    fail(error: unknown, phase: FailurePhase, componentStack?: string | null) {
      if (status === 'closed') return;
      if (status === 'failed') {
        if (phase !== 'renderer initialization') publishFailure();
        return;
      }
      status = 'failed';
      errorPending = true;
      stop();
      // Keep the original Error (and its JS stack), not just the player-facing
      // message. Do not filter library warnings or replace the throwing value.
      if (__DEV__) console.error(`[CHROMA RIFT 3D: ${phase}]`, error, componentStack ?? '');
      if (phase !== 'renderer initialization') publishFailure();
    },
    close() {
      if (status === 'closed') return;
      status = 'closed';
      stop();
      renderer?.dispose();
      renderer = undefined;
      root = undefined;
    },
  };
}
export type CanvasLifecycle = ReturnType<typeof createCanvasLifecycle>;
