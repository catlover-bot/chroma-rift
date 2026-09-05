import { memoizeNativeRenderer, observeNativeContext, type NativeRendererDefaults } from '../nativeRendererFactory';

function adapter() {
  const context = { drawingBufferWidth: 390, drawingBufferHeight: 740 };
  const canvas = { getContext: jest.fn(function (this: unknown, ..._args: unknown[]) { return context; }) };
  return { canvas, context, defaults: { canvas, antialias: false } as unknown as NativeRendererDefaults };
}

describe('native renderer factory observation contract (no GL)', () => {
  it('observes the constructor’s original request once with the exact receiver/arguments and restores the adapter', () => {
    const { canvas, context, defaults } = adapter();
    const original = canvas.getContext;
    const observe = jest.fn();
    const attributes = { antialias: false, depth: true };
    const result = { render: jest.fn() };
    expect(observeNativeContext(defaults, observe, () => {
      expect(canvas.getContext('webgl2', attributes)).toBe(context);
      expect(observe).toHaveBeenCalledWith(context);
      return result;
    })).toBe(result);
    expect(original.mock.calls).toEqual([['webgl2', attributes]]);
    expect(original.mock.contexts).toEqual([canvas]);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(canvas.getContext).toBe(original);
  });

  it('restores a throwing constructor’s adapter and counts a repeatedly requested context only once', () => {
    const { canvas, defaults } = adapter();
    const original = canvas.getContext;
    const observe = jest.fn();
    const error = new Error('constructor failed after context creation');
    expect(() => observeNativeContext(defaults, observe, () => {
      canvas.getContext('webgl2', { antialias: false });
      canvas.getContext('webgl2', { antialias: false });
      throw error;
    })).toThrow(error);
    expect(original).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(canvas.getContext).toBe(original);
  });

  it('reuses one adapter’s renderer during configure reentry but never shares a cache across visits or adapters', () => {
    const first = adapter();
    const second = adapter();
    const create = jest.fn(() => ({ render: jest.fn() }));
    const factory = memoizeNativeRenderer(create);
    const renderer = factory(first.defaults);
    expect(factory({ ...first.defaults })).toBe(renderer);
    expect(create).toHaveBeenCalledTimes(1);
    expect(factory(second.defaults)).not.toBe(renderer);
    expect(memoizeNativeRenderer(create)(first.defaults)).not.toBe(renderer);
    expect(create).toHaveBeenCalledTimes(3);
  });
});
