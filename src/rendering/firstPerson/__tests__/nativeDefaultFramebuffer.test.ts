import { installNativeDefaultFramebuffer, type NativeFramebufferTrace } from '../nativeDefaultFramebuffer';

// TEST/FIXTURE: a GLES draw-buffer semantic model, not a GPU or iPhone result.
// Expo translates logical null/0 to its nonzero View-owned drawable FBO. A
// COMPLETE named framebuffer still rejects BACK; completeness cannot catch H1.
function nativeFixture(drawable = 17) {
  const A = { id: 31 }, B = { id: 32 };
  let draw = drawable, read = drawable;
  const errors: number[] = [];
  const returned = { fixture: 'TEST/FIXTURE native return' };
  const gl = {
    FRAMEBUFFER: 0x8d40, DRAW_FRAMEBUFFER: 0x8ca9, READ_FRAMEBUFFER: 0x8ca8,
    FRAMEBUFFER_COMPLETE: 0x8cd5, BACK: 0x405, COLOR_ATTACHMENT0: 0x8ce0, NONE: 0,
    NO_ERROR: 0, INVALID_OPERATION: 0x502, INVALID_ENUM: 0x500,
    endFrameEXP: jest.fn(),
    bindFramebuffer: jest.fn(function (this: unknown, target: unknown, framebuffer: unknown, ..._extra: unknown[]) {
      if (this !== gl) return returned;
      if (![gl.FRAMEBUFFER, gl.DRAW_FRAMEBUFFER, gl.READ_FRAMEBUFFER].includes(target as number)) {
        errors.push(gl.INVALID_ENUM); return returned;
      }
      const native = framebuffer === null || framebuffer === 0 ? drawable : framebuffer === A ? A.id : framebuffer === B ? B.id : undefined;
      if (native === undefined) { errors.push(gl.INVALID_OPERATION); return returned; }
      if (target !== gl.READ_FRAMEBUFFER) draw = native;
      if (target !== gl.DRAW_FRAMEBUFFER) read = native;
      return returned;
    }),
    drawBuffers: jest.fn(function (this: unknown, buffers: unknown, ..._extra: unknown[]) {
      if (this !== gl) return returned;
      if (!Array.isArray(buffers)) throw new TypeError('TEST/FIXTURE native drawBuffers expects a JS Array');
      if (buffers.some((value, index) => value !== gl.NONE && (draw === 0 ? buffers.length !== 1 || value !== gl.BACK : value !== gl.COLOR_ATTACHMENT0 + index))) errors.push(gl.INVALID_OPERATION);
      return returned;
    }),
    checkFramebufferStatus: jest.fn(() => 0x8cd5),
    getParameter: jest.fn(() => { throw new Error('TEST/FIXTURE unsupported framebuffer query'); }),
    getError: jest.fn(() => errors.shift() ?? 0),
  };
  return { gl, A, B, returned, nativeBindings: () => ({ draw, read }) };
}
const install = (gl: unknown, onTrace?: (event: NativeFramebufferTrace) => void) =>
  installNativeDefaultFramebuffer(gl, { platform: 'ios', owned: true, ...(onTrace ? { onTrace } : {}) })!;

describe('Expo iOS logical default framebuffer adapter (strict native semantic fixture only)', () => {
  it('demonstrates unadapted BACK failing on a COMPLETE nonzero drawable', () => {
    const { gl, A, nativeBindings } = nativeFixture();
    gl.bindFramebuffer(gl.FRAMEBUFFER, A); gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers([gl.BACK]);
    expect(nativeBindings().draw).toBe(17);
    expect(gl.checkFramebufferStatus()).toBe(gl.FRAMEBUFFER_COMPLETE);
    expect(gl.getError()).toBe(gl.INVALID_OPERATION);
  });

  it('restores a COMPLETE logical default after reflection without GL_INVALID_OPERATION', () => {
    const { gl, A, nativeBindings } = nativeFixture();
    const originalDraw = gl.drawBuffers;
    const adapter = install(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, A); gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers([gl.BACK]);
    expect(nativeBindings().draw).toBe(17);
    expect(gl.checkFramebufferStatus()).toBe(gl.FRAMEBUFFER_COMPLETE);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    expect(originalDraw.mock.calls.map(call => call[0])).toEqual([[gl.COLOR_ATTACHMENT0], [gl.COLOR_ATTACHMENT0]]);
    adapter.dispose();
  });

  it('maps initial default without querying GL, preserves constants, the frozen caller array, this and return', () => {
    const { gl, returned } = nativeFixture();
    const original = gl.drawBuffers, requested = Object.freeze([gl.BACK]);
    const adapter = install(gl);
    expect(gl.drawBuffers(requested)).toBe(returned);
    expect(original.mock.contexts).toEqual([gl]);
    expect(original.mock.calls[0]![0]).toEqual([gl.COLOR_ATTACHMENT0]);
    expect(original.mock.calls[0]![0]).not.toBe(requested);
    expect(requested).toEqual([0x405]); expect(gl.BACK).toBe(0x405);
    expect(gl.getError).not.toHaveBeenCalled(); expect(gl.getParameter).not.toHaveBeenCalled();
    expect(gl.checkFramebufferStatus).not.toHaveBeenCalled(); expect(gl.endFrameEXP).not.toHaveBeenCalled();
    expect(adapter.snapshot()).toEqual({ draw: 'default', read: 'default', bindCalls: 0, drawBuffersCalls: 1, mappedCalls: 1 });
    expect(gl.getError()).toBe(gl.NO_ERROR);
    adapter.dispose();
  });

  it('tracks FRAMEBUFFER coupling and keeps READ_FRAMEBUFFER independent of DRAW_FRAMEBUFFER', () => {
    const { gl, A, B, nativeBindings } = nativeFixture();
    const original = gl.drawBuffers, adapter = install(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, A);
    expect(adapter.snapshot()).toMatchObject({ draw: 'offscreen', read: 'offscreen' });
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    expect(nativeBindings()).toEqual({ draw: 17, read: A.id });
    expect(adapter.snapshot()).toMatchObject({ draw: 'default', read: 'offscreen' });
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, B); gl.drawBuffers([gl.BACK]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, A); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    expect(nativeBindings()).toEqual({ draw: A.id, read: 17 });
    expect(adapter.snapshot()).toMatchObject({ draw: 'offscreen', read: 'default' });
    const invalidOffscreen = [gl.BACK];
    gl.drawBuffers(invalidOffscreen);
    expect(original.mock.calls.at(-1)![0]).toBe(invalidOffscreen);
    expect(gl.getError()).toBe(gl.INVALID_OPERATION);
    gl.bindFramebuffer(gl.FRAMEBUFFER, 0); gl.drawBuffers([gl.BACK]);
    expect(adapter.snapshot()).toMatchObject({ draw: 'default', read: 'default' });
    expect(gl.getError()).toBe(gl.NO_ERROR);
    adapter.dispose();
  });

  it('preserves offscreen A to B to default, NONE and MRT array identities across repeated frames', () => {
    const { gl, A, B } = nativeFixture();
    const original = gl.drawBuffers, adapter = install(gl);
    const mrt = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT0 + 1], none = [gl.NONE];
    for (let frame = 0; frame < 3; frame += 1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, A); gl.drawBuffers(mrt);
      expect(original.mock.calls.at(-1)![0]).toBe(mrt);
      gl.bindFramebuffer(gl.FRAMEBUFFER, B); gl.drawBuffers(none);
      expect(original.mock.calls.at(-1)![0]).toBe(none);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers(none);
      expect(original.mock.calls.at(-1)![0]).toBe(none);
      gl.drawBuffers([gl.BACK]); expect(gl.getError()).toBe(gl.NO_ERROR);
    }
    expect(adapter.snapshot()).toMatchObject({ bindCalls: 9, drawBuffersCalls: 12, mappedCalls: 3 });
    adapter.dispose();
  });

  it.each(['web', 'android'])('leaves the %s path untouched, including browser BACK', (platform) => {
    const { gl } = nativeFixture(0);
    const original = gl.drawBuffers;
    expect(installNativeDefaultFramebuffer(gl, { platform, owned: true })).toBeUndefined();
    gl.drawBuffers([gl.BACK]);
    expect(gl.drawBuffers).toBe(original); expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it('leaves unowned, non-Expo and incomplete contexts untouched', () => {
    const { gl } = nativeFixture();
    const original = gl.drawBuffers;
    expect(installNativeDefaultFramebuffer(gl, { platform: 'ios', owned: false })).toBeUndefined();
    expect(install({ ...gl, endFrameEXP: undefined })).toBeUndefined();
    expect(install({ ...gl, drawBuffers: undefined })).toBeUndefined();
    expect(install({ ...gl, DRAW_FRAMEBUFFER: undefined })).toBeUndefined();
    expect(install({ ...gl, BACK: NaN })).toBeUndefined();
    expect(gl.drawBuffers).toBe(original);
  });

  it('does not normalize invalid arrays, typed arrays, empty input or extra arguments', () => {
    const { gl } = nativeFixture();
    const original = gl.drawBuffers, adapter = install(gl);
    const invalid = [gl.BACK, gl.NONE], empty: number[] = [];
    gl.drawBuffers(invalid); expect(original.mock.calls.at(-1)![0]).toBe(invalid);
    expect(gl.getError()).toBe(gl.INVALID_OPERATION);
    gl.drawBuffers(empty); expect(original.mock.calls.at(-1)![0]).toBe(empty);
    const typed = new Uint32Array([gl.BACK]);
    expect(() => gl.drawBuffers(typed)).toThrow('TEST/FIXTURE native drawBuffers expects a JS Array');
    expect(original.mock.calls.at(-1)![0]).toBe(typed);
    expect(() => gl.drawBuffers(null)).toThrow('TEST/FIXTURE native drawBuffers expects a JS Array');
    const extra = [gl.BACK]; gl.drawBuffers(extra, 'TEST/FIXTURE extra');
    expect(original.mock.calls.at(-1)).toEqual([extra, 'TEST/FIXTURE extra']);
    expect(original.mock.calls.at(-1)![0]).toBe(extra); expect(gl.getError()).toBe(gl.INVALID_OPERATION);
    expect(adapter.snapshot().mappedCalls).toBe(0);
    adapter.dispose();
  });

  it('does not evaluate malformed accessor elements ahead of the native method, even with trace enabled', () => {
    const { gl } = nativeFixture();
    const original = gl.drawBuffers, failure = new Error('TEST/FIXTURE native array access failure');
    const getter = jest.fn(() => { throw failure; });
    const requested = Object.defineProperty([], '0', { get: getter });
    const trace = jest.fn(), adapter = install(gl, trace);
    expect(() => gl.drawBuffers(requested)).toThrow(failure);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(original.mock.calls[0]![0]).toBe(requested);
    expect(original.mock.results[0]!.value).toBe(failure);
    expect(trace.mock.calls.map(([event]) => event.phase)).toEqual(['before', 'threw']);
    expect(adapter.snapshot().mappedCalls).toBe(0);
    adapter.dispose();
  });

  it('preserves invalid-bind errors and records unknown requested binding instead of assuming native success', () => {
    const { gl } = nativeFixture();
    const original = gl.drawBuffers, adapter = install(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, undefined);
    expect(adapter.snapshot()).toMatchObject({ draw: 'unknown', read: 'unknown' });
    gl.drawBuffers([gl.BACK]);
    expect(original.mock.calls.at(-1)![0]).toEqual([gl.BACK]);
    expect(gl.getError()).toBe(gl.INVALID_OPERATION); expect(gl.getError()).toBe(gl.INVALID_OPERATION);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindFramebuffer(-1, null); gl.drawBuffers([gl.BACK]);
    expect(adapter.snapshot()).toMatchObject({ draw: 'default', read: 'default' });
    expect(gl.getError()).toBe(gl.INVALID_ENUM);
    adapter.dispose();
  });

  it('preserves native exceptions and prior tracking, then restores in caller finally', () => {
    const { gl, A } = nativeFixture();
    const originalBind = gl.bindFramebuffer, originalDraw = gl.drawBuffers;
    const bindFailure = new Error('TEST/FIXTURE native bind failure'), drawFailure = new Error('TEST/FIXTURE native draw failure');
    const trace = jest.fn(), adapter = install(gl, trace);
    try {
      originalBind.mockImplementationOnce(() => { throw bindFailure; });
      expect(() => gl.bindFramebuffer(gl.FRAMEBUFFER, A)).toThrow(bindFailure);
      expect(adapter.snapshot()).toMatchObject({ draw: 'default', read: 'default' });
      originalDraw.mockImplementationOnce(() => { throw drawFailure; });
      expect(() => gl.drawBuffers([gl.BACK])).toThrow(drawFailure);
      expect(originalDraw.mock.results[0]!.value).toBe(drawFailure);
      expect(trace.mock.calls.map(([event]) => [event.sequence, event.phase])).toEqual([[1, 'before'], [1, 'threw'], [2, 'before'], [2, 'threw']]);
    } finally { adapter.dispose(); }
    expect(gl.bindFramebuffer).toBe(originalBind); expect(gl.drawBuffers).toBe(originalDraw);
  });

  it('preserves borrowed receiver and extra argument forwarding without changing this context tracking', () => {
    const { gl, A, returned } = nativeFixture();
    const originalBind = gl.bindFramebuffer, originalDraw = gl.drawBuffers, adapter = install(gl);
    const receiver = { fixture: 'TEST/FIXTURE other receiver' }, requested = [gl.BACK];
    expect(gl.bindFramebuffer.call(receiver, gl.FRAMEBUFFER, A, 'extra')).toBe(returned);
    expect(gl.drawBuffers.call(receiver, requested, 'extra')).toBe(returned);
    expect(originalBind.mock.contexts).toEqual([receiver]); expect(originalDraw.mock.contexts).toEqual([receiver]);
    expect(originalBind.mock.calls).toEqual([[gl.FRAMEBUFFER, A, 'extra']]);
    expect(originalDraw.mock.calls).toEqual([[requested, 'extra']]);
    expect(adapter.snapshot()).toEqual({ draw: 'default', read: 'default', bindCalls: 0, drawBuffersCalls: 0, mappedCalls: 0 });
    adapter.dispose();
  });

  it('tracks a finally restoration after a reflection exception without consuming its GL error', () => {
    const { gl, A, nativeBindings } = nativeFixture();
    const original = gl.drawBuffers, failure = new Error('TEST/FIXTURE reflection failed');
    const adapter = install(gl);
    expect(() => {
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, A);
        gl.drawBuffers([gl.BACK]); // Invalid offscreen draw stays visible to the error owner.
        throw failure;
      } finally { gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    }).toThrow(failure);
    gl.drawBuffers([gl.BACK]);
    expect(nativeBindings()).toEqual({ draw: 17, read: 17 });
    expect(original.mock.calls.map(call => call[0])).toEqual([[gl.BACK], [gl.COLOR_ATTACHMENT0]]);
    expect(gl.getError).not.toHaveBeenCalled();
    expect(gl.getError()).toBe(gl.INVALID_OPERATION); expect(gl.getError()).toBe(gl.NO_ERROR);
    adapter.dispose();
  });

  it('bounds trace payloads, pairs call phases, and stops callbacks while keeping mapping counters', () => {
    const { gl, A } = nativeFixture();
    const events: NativeFramebufferTrace[] = [], adapter = install(gl, event => events.push(event));
    gl.bindFramebuffer(gl.FRAMEBUFFER, A); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers([gl.BACK]);
    expect(events.map(event => [event.sequence, event.phase])).toEqual([[1, 'before'], [1, 'returned'], [2, 'before'], [2, 'returned'], [3, 'before'], [3, 'returned']]);
    expect(events[0]).toMatchObject({ draw: 'default', requestedFramebuffer: 'offscreen' });
    expect(events[1]).toMatchObject({ draw: 'offscreen', read: 'offscreen' });
    expect(events[5]).toMatchObject({ mapped: true, requestedBuffers: [gl.BACK], forwardedBuffers: [gl.COLOR_ATTACHMENT0] });
    gl.drawBuffers(Array.from({ length: 100 }, (_, i) => gl.COLOR_ATTACHMENT0 + i));
    expect(events.at(-1)?.requestedBuffers).toHaveLength(8); expect(events.at(-1)?.bufferCount).toBe(100);
    for (let i = 0; i < 100; i += 1) gl.drawBuffers([gl.BACK]);
    expect(events).toHaveLength(64);
    const mappedBefore = adapter.snapshot().mappedCalls;
    adapter.stopTrace(); gl.drawBuffers([gl.BACK]);
    expect(events).toHaveLength(64); expect(adapter.snapshot().mappedCalls).toBe(mappedBefore + 1);
    expect(gl.getError).not.toHaveBeenCalled(); expect(gl.getParameter).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it('stops trace before its cap and contains diagnostic exceptions and event-array mutations', () => {
    const { gl, returned } = nativeFixture();
    const original = gl.drawBuffers, failure = new Error('TEST/FIXTURE diagnostic callback failure');
    const trace = jest.fn((event: NativeFramebufferTrace) => {
      if (Array.isArray(event.requestedBuffers)) event.requestedBuffers[0] = -1;
      if (Array.isArray(event.forwardedBuffers)) event.forwardedBuffers[0] = -1;
      throw failure;
    });
    const adapter = install(gl, trace), requested = [gl.BACK];
    expect(gl.drawBuffers(requested)).toBe(returned);
    expect(requested).toEqual([gl.BACK]); expect(original.mock.calls[0]![0]).toEqual([gl.COLOR_ATTACHMENT0]);
    expect(trace).toHaveBeenCalledTimes(2);
    adapter.stopTrace(); gl.drawBuffers(requested); gl.drawBuffers(requested);
    expect(trace).toHaveBeenCalledTimes(2); expect(adapter.snapshot().mappedCalls).toBe(3);
    adapter.dispose();
  });

  it('rejects a duplicate owner, restores exact methods on dispose, and supports ten fresh ownership cycles', () => {
    const { gl, A } = nativeFixture();
    const originalBind = Object.getOwnPropertyDescriptor(gl, 'bindFramebuffer'), originalDraw = Object.getOwnPropertyDescriptor(gl, 'drawBuffers');
    for (let visit = 0; visit < 10; visit += 1) {
      const adapter = install(gl), wrapped = gl.drawBuffers;
      expect(() => install(gl)).toThrow('live context owner');
      expect(gl.drawBuffers).toBe(wrapped);
      gl.bindFramebuffer(gl.FRAMEBUFFER, A); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers([gl.BACK]);
      expect(gl.getError()).toBe(gl.NO_ERROR); expect(adapter.snapshot().mappedCalls).toBe(1);
      adapter.dispose(); adapter.dispose();
      expect(Object.getOwnPropertyDescriptor(gl, 'bindFramebuffer')).toEqual(originalBind);
      expect(Object.getOwnPropertyDescriptor(gl, 'drawBuffers')).toEqual(originalDraw);
    }
    gl.drawBuffers([gl.BACK]); expect(gl.getError()).toBe(gl.INVALID_OPERATION);
  });

  it('restores inherited methods without leaving own wrappers or changing the prototype', () => {
    const prototype = nativeFixture().gl, gl = Object.create(prototype) as typeof prototype;
    const adapter = install(gl);
    expect(Object.hasOwn(gl, 'bindFramebuffer')).toBe(true);
    adapter.dispose();
    expect(Object.hasOwn(gl, 'bindFramebuffer')).toBe(false); expect(Object.hasOwn(gl, 'drawBuffers')).toBe(false);
    expect(gl.bindFramebuffer).toBe(prototype.bindFramebuffer); expect(gl.drawBuffers).toBe(prototype.drawBuffers);
  });

  it('rolls back a partially failed install without claiming context ownership', () => {
    const { gl } = nativeFixture(), originalBind = gl.bindFramebuffer, originalDraw = gl.drawBuffers;
    Object.defineProperty(gl, 'drawBuffers', { value: originalDraw, writable: false, configurable: false });
    expect(() => install(gl)).toThrow(TypeError);
    expect(gl.bindFramebuffer).toBe(originalBind); expect(gl.drawBuffers).toBe(originalDraw);
    expect(() => install(gl)).not.toThrow('live context owner');
  });

  it('supports nonconfigurable writable native methods and restores their exact descriptors', () => {
    const { gl } = nativeFixture();
    Object.defineProperty(gl, 'bindFramebuffer', { configurable: false });
    Object.defineProperty(gl, 'drawBuffers', { configurable: false });
    const beforeBind = Object.getOwnPropertyDescriptor(gl, 'bindFramebuffer');
    const beforeDraw = Object.getOwnPropertyDescriptor(gl, 'drawBuffers');
    const adapter = install(gl);
    gl.drawBuffers([gl.BACK]); expect(gl.getError()).toBe(gl.NO_ERROR);
    adapter.dispose();
    expect(Object.getOwnPropertyDescriptor(gl, 'bindFramebuffer')).toEqual(beforeBind);
    expect(Object.getOwnPropertyDescriptor(gl, 'drawBuffers')).toEqual(beforeDraw);
  });

  it('does not clobber a newer wrapper and makes retained old wrappers inert after disposal', () => {
    const { gl } = nativeFixture(), original = gl.drawBuffers;
    const adapter = install(gl), retained = gl.drawBuffers;
    const newer = function (this: unknown, ...args: unknown[]) { return retained.apply(this, args as [unknown]); };
    gl.drawBuffers = newer as typeof gl.drawBuffers;
    adapter.dispose();
    expect(gl.drawBuffers).toBe(newer);
    gl.drawBuffers([gl.BACK]);
    expect(original.mock.calls.at(-1)![0]).toEqual([gl.BACK]); expect(gl.getError()).toBe(gl.INVALID_OPERATION);
    expect(adapter.snapshot().mappedCalls).toBe(0);
    const retry = install(gl); gl.drawBuffers([gl.BACK]); expect(gl.getError()).toBe(gl.NO_ERROR);
    retry.dispose(); expect(gl.drawBuffers).toBe(newer);
  });
});
