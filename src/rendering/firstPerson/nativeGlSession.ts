import type * as THREE from 'three';
import { sampleGlDiagnostics, type FirstPersonDiagnostics } from './diagnostics';
import { installNativeDefaultFramebuffer, type NativeDefaultFramebufferAdapter, type NativeFramebufferTrace } from './nativeDefaultFramebuffer';
import { createNativeGlObserver, type NativeGlObserver } from './nativeGlObserver';

/** Context-local correction and bounded startup instrumentation. The Canvas
 * owner installs this before Three initialization and releases it on exit. */
export function createNativeGlSession(record: FirstPersonDiagnostics, platform: string, trace: boolean) {
  let adapter: NativeDefaultFramebufferAdapter | undefined;
  let observer: NativeGlObserver | undefined;
  let observedContext: WebGLRenderingContext | undefined;
  let restoreTarget: (() => void) | undefined;
  let phase = 'renderer-init';
  let cleanDrawSequence: number | undefined;
  const snapshot = () => { if (adapter) record.glFramebuffer = adapter.snapshot(); };
  const onTrace = (event: NativeFramebufferTrace) => {
    snapshot();
    const boundary = observer?.boundary(`${phase}:${event.operation}:${event.phase}`);
    if (event.operation !== 'drawBuffers') return;
    if (event.phase === 'before') {
      cleanDrawSequence = boundary?.confirmedClear && !boundary.errors.length && !record.glErrors.some(error => error !== 'unsupported') ? event.sequence : undefined;
    } else {
      if (event.phase === 'returned' && boundary?.errors.includes('0x502') && cleanDrawSequence === event.sequence &&
          Array.isArray(event.forwardedBuffers)) {
        record.glTrace.firstInvalidOperation ??= { operation: 'drawBuffers', boundary,
          buffers: [...event.forwardedBuffers], mapped: event.mapped === true };
      }
      cleanDrawSequence = undefined;
    }
  };
  return {
    observeContext(context: Pick<WebGLRenderingContext, 'drawingBufferWidth' | 'drawingBufferHeight'>) {
      observedContext = context as WebGLRenderingContext;
      const support = (context as { supportsWebGL2?: unknown }).supportsWebGL2;
      record.supportsWebGL2 = typeof support === 'boolean' ? support : 'unsupported';
      adapter = installNativeDefaultFramebuffer(context, { platform, owned: true, ...(trace ? { onTrace } : {}) });
      snapshot();
      observer = createNativeGlObserver(record, observedContext, trace && !!adapter, () => adapter?.snapshot() ?? { draw: 'unknown', read: 'unknown' });
      observer.boundary('pre-existing/init');
    },
    attach(renderer: THREE.WebGLRenderer) {
      const context = renderer.getContext();
      // Contract tests can provide a renderer without a real canvas context.
      // The actual Expo path returns the context observed before construction.
      if (!observer || observedContext !== context) {
        observer = createNativeGlObserver(record, context, false);
        observedContext = context;
      }
      observer.boundary('after-renderer-init');
      if (!observer.tracing) return;
      const original = renderer.setRenderTarget;
      const wrapped: typeof original = function (this: THREE.WebGLRenderer, ...args) {
        const previous = phase;
        phase = args[0] === null ? 'target-restoration' : 'offscreen-target-setup';
        observer?.boundary(`before-${phase}`);
        try { return original.apply(this, args); }
        finally { observer?.boundary(`after-${phase}`); phase = previous; }
      };
      renderer.setRenderTarget = wrapped;
      restoreTarget = () => { if (renderer.setRenderTarget === wrapped) renderer.setRenderTarget = original; };
    },
    boundary(name: string) { phase = name; observer?.boundary(name); },
    sample(renderer: THREE.WebGLRenderer) { sampleGlDiagnostics(record, renderer.getContext(), observer); },
    offscreenStatus(renderer: THREE.WebGLRenderer) {
      const gl = renderer.getContext();
      return observer?.query('offscreen-framebuffer-status', typeof gl.checkFramebufferStatus === 'function' && typeof gl.FRAMEBUFFER === 'number'
        ? () => gl.checkFramebufferStatus(gl.FRAMEBUFFER) : undefined) ?? 'unsupported';
    },
    stopTrace(completed = false) {
      snapshot();
      restoreTarget?.(); restoreTarget = undefined;
      adapter?.stopTrace();
      if (completed) observer?.complete(); else observer?.stop();
    },
    dispose() {
      snapshot();
      restoreTarget?.(); restoreTarget = undefined;
      adapter?.dispose(); adapter = undefined;
      observer?.stop();
    },
  };
}
