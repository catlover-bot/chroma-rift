import type { ComponentProps } from 'react';
import type { Canvas } from '@react-three/fiber/native';

export type NativeRendererDefaults = Parameters<NonNullable<Extract<ComponentProps<typeof Canvas>['gl'], (...args: never[]) => unknown>>>[0];

/** Native Canvas can re-enter async configure when canvas.getContext updates
 * its antialias state, before R3F has stored the first returned renderer.
 * Memoize by the adapter canvas, never globally or across native contexts. */
export function memoizeNativeRenderer<T>(create: (defaults: NativeRendererDefaults) => T) {
  const renderers = new WeakMap<object, T>();
  return (defaults: NativeRendererDefaults): T => {
    const cached = renderers.get(defaults.canvas);
    if (cached) return cached;
    const renderer = create(defaults);
    renderers.set(defaults.canvas, renderer);
    return renderer;
  };
}

/** Observe only the constructor's own native-context request. No extra request,
 * GL-method patch, or prototype change; restore the adapter in all outcomes. */
export function observeNativeContext<T>(defaults: NativeRendererDefaults, observe: (context: { drawingBufferWidth: number; drawingBufferHeight: number }) => void, create: () => T): T {
  const canvas = defaults.canvas as unknown as { getContext: (...args: unknown[]) => unknown };
  const original = canvas.getContext;
  const seen = new Set<object>();
  canvas.getContext = function (...args) {
    const context = original.apply(this, args);
    if (context && typeof context === 'object' && 'drawingBufferWidth' in context && 'drawingBufferHeight' in context &&
        typeof context.drawingBufferWidth === 'number' && typeof context.drawingBufferHeight === 'number' && !seen.has(context)) {
      seen.add(context);
      observe(context as { drawingBufferWidth: number; drawingBufferHeight: number });
    }
    return context;
  };
  try { return create(); }
  finally { canvas.getContext = original; }
}
