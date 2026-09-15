export type LogicalFramebuffer = 'default' | 'offscreen' | 'unknown';
export type NativeFramebufferBindings = { draw: LogicalFramebuffer; read: LogicalFramebuffer };
export type NativeFramebufferSnapshot = NativeFramebufferBindings & {
  bindCalls: number; drawBuffersCalls: number; mappedCalls: number;
};
export type NativeFramebufferTrace = NativeFramebufferBindings & {
  operation: 'bindFramebuffer' | 'drawBuffers';
  phase: 'before' | 'returned' | 'threw';
  sequence: number;
  target?: number | 'invalid';
  requestedFramebuffer?: LogicalFramebuffer;
  requestedBuffers?: readonly number[] | 'invalid';
  forwardedBuffers?: readonly number[] | 'invalid';
  bufferCount?: number | 'invalid';
  mapped?: boolean;
};
export type NativeDefaultFramebufferAdapter = {
  snapshot(): NativeFramebufferSnapshot;
  stopTrace(): void;
  dispose(): void;
};

type NativeContext = {
  FRAMEBUFFER: number; DRAW_FRAMEBUFFER: number; READ_FRAMEBUFFER: number;
  BACK: number; COLOR_ATTACHMENT0: number;
  bindFramebuffer: (...args: unknown[]) => unknown;
  drawBuffers: (...args: unknown[]) => unknown;
  endFrameEXP: (...args: unknown[]) => unknown;
};
const owners = new WeakSet<object>();
const MAX_TRACE_EVENTS = 64;
const MAX_TRACE_BUFFERS = 8;

function classify(framebuffer: unknown): LogicalFramebuffer {
  if (framebuffer === null || framebuffer === 0) return 'default';
  return typeof framebuffer === 'object' ? 'offscreen' : 'unknown';
}
// Reading accessor/proxy elements here could change the original method's
// argument validation. Only ordinary own data elements qualify for mapping.
function isBackArray(value: unknown, back: number): boolean {
  try {
    return Array.isArray(value) && Object.getOwnPropertyDescriptor(value, 'length')?.value === 1 &&
      Object.getOwnPropertyDescriptor(value, '0')?.value === back;
  } catch { return false; }
}
function summarizeBuffers(value: unknown): { values: readonly number[] | 'invalid'; count: number | 'invalid' } {
  try {
    if (!Array.isArray(value)) return { values: 'invalid', count: 'invalid' };
    const count: unknown = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (typeof count !== 'number') return { values: 'invalid', count: 'invalid' };
    const values: number[] = [];
    for (let i = 0; i < Math.min(count, MAX_TRACE_BUFFERS); i += 1) {
      const item: unknown = Object.getOwnPropertyDescriptor(value, String(i))?.value;
      if (typeof item !== 'number' || !Number.isFinite(item)) return { values: 'invalid', count };
      values.push(item);
    }
    return { values, count };
  } catch { return { values: 'invalid', count: 'invalid' }; }
}

/** Install before the owned Expo iOS renderer's first GL call. Expo maps the
 * requested null/0 framebuffer to its own nonzero drawable; GLES therefore
 * needs COLOR_ATTACHMENT0 for Three's logical-default [BACK] request.
 * All binding states below are tracked requests, never queried native IDs. */
export function installNativeDefaultFramebuffer(context: unknown, options: {
  platform: string; owned: boolean; onTrace?: (event: NativeFramebufferTrace) => void;
}): NativeDefaultFramebufferAdapter | undefined {
  if (options.platform !== 'ios' || !options.owned || !context || typeof context !== 'object') return undefined;
  const gl = context as NativeContext;
  if (typeof gl.endFrameEXP !== 'function' || typeof gl.bindFramebuffer !== 'function' || typeof gl.drawBuffers !== 'function' ||
      ![gl.FRAMEBUFFER, gl.DRAW_FRAMEBUFFER, gl.READ_FRAMEBUFFER, gl.BACK, gl.COLOR_ATTACHMENT0].every(value => typeof value === 'number' && Number.isFinite(value))) return undefined;
  if (owners.has(gl)) throw new Error('The Expo framebuffer adapter already has a live context owner.');
  const originalBind = gl.bindFramebuffer, originalDraw = gl.drawBuffers;
  const descriptors = { bindFramebuffer: Object.getOwnPropertyDescriptor(gl, 'bindFramebuffer'),
    drawBuffers: Object.getOwnPropertyDescriptor(gl, 'drawBuffers') };
  let active = true, trace = options.onTrace, traceEvents = 0, sequence = 0;
  let draw: LogicalFramebuffer = 'default', read: LogicalFramebuffer = 'default';
  let bindCalls = 0, drawBuffersCalls = 0, mappedCalls = 0;
  type TraceCall = Omit<NativeFramebufferTrace, 'phase' | 'draw' | 'read'>;
  const emit = (call: TraceCall | undefined, phase: NativeFramebufferTrace['phase']) => {
    if (!call || !trace || traceEvents >= MAX_TRACE_EVENTS) return;
    traceEvents += 1;
    try {
      trace({ ...call, phase, draw, read,
        ...(call.requestedBuffers ? { requestedBuffers: Array.isArray(call.requestedBuffers) ? [...call.requestedBuffers] : call.requestedBuffers } : {}),
        ...(call.forwardedBuffers ? { forwardedBuffers: Array.isArray(call.forwardedBuffers) ? [...call.forwardedBuffers] : call.forwardedBuffers } : {}) });
    } catch { /* Diagnostic callbacks cannot change native return/throw semantics. */ }
  };
  const bindFramebuffer = function (this: unknown, ...args: unknown[]) {
    if (!active || this !== gl) return originalBind.apply(this, args);
    bindCalls += 1; sequence += 1;
    const target = args[0], requested = args.length >= 2 ? classify(args[1]) : 'unknown';
    const call: TraceCall | undefined = trace && traceEvents <= MAX_TRACE_EVENTS - 2 ? {
      operation: 'bindFramebuffer', sequence, target: typeof target === 'number' && Number.isFinite(target) ? target : 'invalid',
      requestedFramebuffer: requested,
    } : undefined;
    emit(call, 'before');
    try {
      const result = originalBind.apply(this, args);
      if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) draw = requested;
      if (target === gl.FRAMEBUFFER || target === gl.READ_FRAMEBUFFER) read = requested;
      emit(call, 'returned');
      return result;
    } catch (error) { emit(call, 'threw'); throw error; }
  };
  const drawBuffers = function (this: unknown, ...args: unknown[]) {
    if (!active || this !== gl) return originalDraw.apply(this, args);
    drawBuffersCalls += 1; sequence += 1;
    const mapped = draw === 'default' && args.length === 1 && isBackArray(args[0], gl.BACK);
    const forwarded = mapped ? [[gl.COLOR_ATTACHMENT0]] : args;
    if (mapped) mappedCalls += 1;
    let call: TraceCall | undefined;
    if (trace && traceEvents <= MAX_TRACE_EVENTS - 2) {
      const requested = summarizeBuffers(args[0]);
      call = { operation: 'drawBuffers', sequence, mapped, requestedBuffers: requested.values,
        forwardedBuffers: mapped ? [gl.COLOR_ATTACHMENT0] : requested.values, bufferCount: requested.count };
    }
    emit(call, 'before');
    try { const result = originalDraw.apply(this, forwarded); emit(call, 'returned'); return result; }
    catch (error) { emit(call, 'threw'); throw error; }
  };
  const restore = (name: keyof typeof descriptors, wrapper: NativeContext[typeof name]) => {
    if (Object.getOwnPropertyDescriptor(gl, name)?.value !== wrapper) return;
    const descriptor = descriptors[name];
    if (descriptor) Object.defineProperty(gl, name, descriptor);
    else delete (gl as Partial<NativeContext>)[name];
  };
  const replace = (name: keyof typeof descriptors, wrapper: NativeContext[typeof name]) => {
    const descriptor = descriptors[name];
    Object.defineProperty(gl, name, descriptor && 'value' in descriptor ? { ...descriptor, value: wrapper } : {
      configurable: true, enumerable: descriptor?.enumerable ?? true, writable: true, value: wrapper,
    });
  };
  try { replace('bindFramebuffer', bindFramebuffer); replace('drawBuffers', drawBuffers); }
  catch (error) { restore('bindFramebuffer', bindFramebuffer); restore('drawBuffers', drawBuffers); throw error; }
  owners.add(gl);
  return {
    snapshot: () => ({ draw, read, bindCalls, drawBuffersCalls, mappedCalls }),
    stopTrace() { trace = undefined; },
    dispose() {
      if (!active) return;
      active = false; trace = undefined; owners.delete(gl);
      try { restore('bindFramebuffer', bindFramebuffer); }
      finally { restore('drawBuffers', drawBuffers); }
    },
  };
}
