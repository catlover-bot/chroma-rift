import { createFirstPersonDiagnostics, recordFirstFailure, serializeFailureDiagnostics } from '../diagnostics';
import { createNativeGlObserver } from '../nativeGlObserver';

// Sticky error queue model; no claim of GPU or iPhone execution.
function fixture(trace = true) {
  const pending: number[] = [];
  const gl = { NO_ERROR: 0, getError: jest.fn(() => pending.shift() ?? 0) };
  const record = createFirstPersonDiagnostics();
  const observer = createNativeGlObserver(record, gl as unknown as WebGLRenderingContext, trace,
    () => ({ draw: 'default', read: 'offscreen' }));
  return { pending, gl, record, observer };
}
describe('single bounded native GL error observer (semantic fixture)', () => {
  it('retains a pre-existing error consumed before renderer initialization', () => {
    const { pending, gl, record, observer } = fixture();
    pending.push(0x502);
    observer.boundary('pre-existing/init');
    observer.boundary('after-renderer-init');
    expect(gl.getError()).toBe(0);
    expect(record.glErrors).toEqual(['0x502']);
    expect(record.glTrace.firstErrorBoundary).toMatchObject({ boundary: 'pre-existing/init', source: 'render',
      errors: ['0x502'], draw: 'default', read: 'offscreen' });
    expect(record.glTrace.firstInvalidOperation).toBeNull();
    recordFirstFailure(record, new Error('Original GL error'), 'GL', 'GL_FRAME');
    recordFirstFailure(record, new Error('Late timeout'), 'initialization timeout', 'STARTUP_TIMEOUT');
    const text = serializeFailureDiagnostics(record, { chapterId: 'mirror-corridor-v1', runtimeSession: 1,
      attempt: 0, restoreOrigin: 'checkpoint', revision: 0, pose: { position: { x: 0, y: 1.6, z: 2.5 }, yaw: Math.PI, pitch: 0 } });
    expect(JSON.parse(text)).toMatchObject({ schemaVersion: 1, firstFailure: { reasonCode: 'GL_FRAME',
      firstErrorBoundary: { boundary: 'pre-existing/init' }, firstInvalidOperation: null },
      gl: { errors: ['0x502'], trace: { bindingEvidence: 'tracked/requested' } } });
    expect(text).not.toContain('Late timeout');
  });
  it('labels errors produced by an available but unsupported diagnostic query separately', () => {
    const { pending, record, observer } = fixture();
    const result = observer.query('fixture-unsupported-enum', () => { pending.push(0x500); return 123; });
    expect(result).toBe('unsupported');
    expect(record.glErrors).toEqual(['0x500']);
    expect(record.glTrace.firstErrorBoundary).toMatchObject({ boundary: 'after-query:fixture-unsupported-enum', source: 'diagnostic-query' });
    expect(record.glTrace.diagnosticQueryFailures).toHaveLength(1);
    expect(record.glTrace.firstInvalidOperation).toBeNull();
  });
  it('does not attribute a queued rendering error to a query or erase it', () => {
    const { pending, record, observer } = fixture();
    pending.push(0x502);
    const query = jest.fn(() => 123);
    expect(observer.query('framebuffer-status', query)).toBe('unsupported');
    expect(query).not.toHaveBeenCalled();
    expect(record.glTrace.firstErrorBoundary?.source).toBe('render');
    expect(record.glTrace.diagnosticQueryFailures).toEqual([]);
  });
  it('records an unsupported query exception without inventing a GL error or exposing its message', () => {
    const { record, observer } = fixture();
    expect(observer.query('unsupported-query', () => { throw new Error('private native detail'); })).toBe('unsupported');
    expect(record.glTrace.diagnosticQueryFailures).toEqual([expect.objectContaining({ source: 'diagnostic-query', queryFailure: 'threw', errors: [] })]);
    expect(record.glTrace.firstErrorBoundary).toBeNull();
    expect(record.glErrors).toEqual([]);
    expect(JSON.stringify(record)).not.toContain('private native detail');
  });
  it('bounds first-frame sampling, stops synchronous tracing, and retains only minimal success costs', () => {
    const { gl, record, observer } = fixture();
    for (let i = 0; i < 200; i += 1) observer.boundary('frame-boundary');
    expect(gl.getError).toHaveBeenCalledTimes(96);
    expect(record.glTrace.entries).toHaveLength(48);
    observer.complete();
    observer.boundary('next-frame');
    expect(gl.getError).toHaveBeenCalledTimes(96);
    expect(record.glTrace.entries).toEqual([]);
    expect(record.glTrace.reads).toBe(96);
    observer.read('cadenced-play-check');
    expect(gl.getError).toHaveBeenCalledTimes(97);
  });
  it('does not turn off error detection when detailed tracing is disabled', () => {
    const { pending, gl, record, observer } = fixture(false);
    observer.boundary('not-traced');
    expect(gl.getError).not.toHaveBeenCalled();
    pending.push(0x502);
    observer.read('before-presentation');
    expect(record.glErrors).toEqual(['0x502']);
    expect(record.glTrace.firstErrorBoundary?.boundary).toBe('before-presentation');
  });
  it('requires an observed NO_ERROR before attributing a later error to a query', () => {
    const { pending, gl, record, observer } = fixture();
    pending.push(0x502);
    gl.getError.mockImplementationOnce(() => { throw new Error('Unavailable synchronization'); });
    const query = jest.fn(() => 123);
    expect(observer.query('framebuffer-status', query)).toBe('unsupported');
    expect(query).not.toHaveBeenCalled();
    expect(record.glTrace.entries[0]?.confirmedClear).toBe(false);
    observer.boundary('next-render-boundary');
    expect(record.glTrace.firstErrorBoundary).toMatchObject({ boundary: 'next-render-boundary', source: 'render', errors: ['0x502'] });
    expect(record.glTrace.firstInvalidOperation).toBeNull();
    expect(record.glTrace.diagnosticQueryFailures).toEqual([]);
  });
});
