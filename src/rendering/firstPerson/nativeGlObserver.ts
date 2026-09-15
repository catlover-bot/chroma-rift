import type { FirstPersonDiagnostics, Measurement } from './diagnostics';

export type LogicalFramebuffer = 'default' | 'offscreen' | 'unknown';
export type GlErrorBoundary = { sequence: number; frame: number; boundary: string;
  source: 'render' | 'diagnostic-query' | 'unattributed'; confirmedClear: boolean;
  errors: string[]; draw: LogicalFramebuffer; read: LogicalFramebuffer;
  queryFailure?: 'threw' };
export type GlTraceRecord = {
  scope: 'disabled' | 'first-frame'; state: 'active' | 'completed' | 'stopped';
  bindingEvidence: 'tracked/requested'; reads: number; boundaries: number; dropped: number;
  entries: GlErrorBoundary[]; firstErrorBoundary: GlErrorBoundary | null;
  firstInvalidOperation: null | { operation: 'drawBuffers'; boundary: GlErrorBoundary; buffers: number[]; mapped: boolean };
  diagnosticQueryFailures: GlErrorBoundary[];
};
export function createGlTraceRecord(): GlTraceRecord {
  return { scope: 'disabled', state: 'stopped', bindingEvidence: 'tracked/requested', reads: 0,
    boundaries: 0, dropped: 0, entries: [], firstErrorBoundary: null, firstInvalidOperation: null, diagnosticQueryFailures: [] };
}

/** The sole getError consumer for this Canvas context. Every consumed error is
 * retained in the failure record, including errors produced by diagnostic APIs.
 * Initial tracing adds synchronous queue boundaries: it is bounded and ends
 * after the first wrapper return. Ordinary checks retain the existing cadence. */
export function createNativeGlObserver(record: FirstPersonDiagnostics, gl: WebGLRenderingContext, trace: boolean,
  binding: () => { draw: LogicalFramebuffer; read: LogicalFramebuffer } = () => ({ draw: 'unknown', read: 'unknown' })) {
  const log = record.glTrace;
  log.scope = trace ? 'first-frame' : 'disabled';
  log.state = trace ? 'active' : 'stopped';
  let sequence = 0;
  const read = (boundary: string, source: GlErrorBoundary['source'] = 'render'): GlErrorBoundary => {
    const entry: GlErrorBoundary = { sequence: ++sequence, frame: record.frameSequence,
      boundary: boundary.slice(0, 96), source, confirmedClear: false, errors: [], ...binding() };
    log.boundaries += 1;
    if (typeof gl.getError !== 'function') {
      if (!record.glErrors.includes('unsupported')) record.glErrors.push('unsupported');
    } else {
      try {
        for (let index = 0; index < 4; index += 1) {
          log.reads += 1;
          const code = gl.getError();
          if (code === gl.NO_ERROR) { entry.confirmedClear = true; break; }
          const error = `0x${code.toString(16)}`;
          entry.errors.push(error);
          // Keep the earliest errors; later cleanup cannot evict the cause.
          if (record.glErrors.length < 8) record.glErrors.push(error);
        }
      } catch {
        if (!record.glErrors.includes('unsupported') && record.glErrors.length < 8) record.glErrors.push('unsupported');
      }
    }
    if (entry.errors.length) {
      log.firstErrorBoundary ??= entry;
      if (source === 'diagnostic-query' && log.diagnosticQueryFailures.length < 4) log.diagnosticQueryFailures.push(entry);
    }
    if (log.state === 'active' || entry.errors.length) {
      if (log.entries.length < 48) log.entries.push(entry);
      else log.dropped += 1;
    }
    return entry;
  };
  return {
    read,
    get tracing() { return log.state === 'active'; },
    boundary(name: string) {
      if (log.state !== 'active') return;
      if (log.boundaries >= 96) { log.dropped += 1; return; }
      return read(name);
    },
    query<T>(name: string, query: (() => T) | undefined): Measurement<T> {
      if (!query) return 'unsupported';
      // Query intervals cannot inherit an earlier unconsumed render error.
      const before = read(`before-query:${name}`);
      if (before.errors.length || record.glErrors.some(value => value !== 'unsupported')) return 'unsupported';
      if (!before.confirmedClear && typeof gl.getError === 'function') return 'unsupported';
      let value: Measurement<T>;
      let threw = false;
      try { value = query(); } catch { value = 'unsupported'; threw = true; }
      // A contract context without getError can expose a query result, but
      // cannot establish that a later error was introduced by this query.
      const after = read(`after-query:${name}`, before.confirmedClear ? 'diagnostic-query' : 'unattributed');
      if (threw) {
        after.queryFailure = 'threw';
        if (!log.diagnosticQueryFailures.includes(after) && log.diagnosticQueryFailures.length < 4) log.diagnosticQueryFailures.push(after);
      }
      return after.errors.length ? 'unsupported' : value;
    },
    complete() {
      log.state = 'completed';
      // Successful startup retains costs and mapping statistics elsewhere,
      // not a long list of successful synchronous queries.
      if (!log.firstErrorBoundary) log.entries = [];
    },
    stop() { log.state = 'stopped'; },
  };
}
export type NativeGlObserver = ReturnType<typeof createNativeGlObserver>;
