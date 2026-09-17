import { getAudioSupportSnapshot } from '../audio/diagnostics';
import { recentFailureSnapshots } from '../rendering/firstPerson/failureLedger';
import { buildIdentity, internalDiagnosticsEnabled } from './buildIdentity';
import { boundedDiagnosticText } from './diagnosticText';

type RecordValue = { [key: string]: unknown };
function object(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}
function parse(record: string): RecordValue {
  try { return object(JSON.parse(record)); }
  catch { return { message: boundedDiagnosticText(record) }; }
}
/** Sanitize values, never machine field names. The existing GL schema stays additive. */
function sanitized(value: unknown, depth = 0): unknown {
  if (depth > 16) return '[bounded]';
  if (typeof value === 'string') return boundedDiagnosticText(value, 32768);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.slice(-256).map(item => sanitized(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(object(value)).slice(0, 256).map(([key, item]) => [key, sanitized(item, depth + 1)]));
  return null;
}
function failureSummary(record: RecordValue): RecordValue {
  const first = object(record.firstFailure), error = object(first.error);
  return {
    label: record.label ?? 'FIRST_FAILURE', schemaVersion: record.schemaVersion ?? 1,
    firstFailure: {
      reasonCode: first.reasonCode ?? record.reasonCode ?? 'unknown',
      phase: first.phase ?? error.phase ?? record.phase ?? 'unknown',
      message: first.message ?? error.message ?? object(record.lastError).message ?? null,
    },
  };
}

/** Called only when support is explicitly opened, refreshed, or copied. No timer. */
export function collectSupportDiagnostics(renderDiagnostics?: () => string): string {
  const full = internalDiagnosticsEnabled();
  let current: RecordValue = {};
  if (renderDiagnostics) {
    try { current = parse(renderDiagnostics()); }
    catch (error) { current = { message: boundedDiagnosticText(error instanceof Error ? error.message : error) }; }
  }
  const retained = recentFailureSnapshots().map(parse);
  const audio = getAudioSupportSnapshot();
  const support = {
    schemaVersion: 1,
    build: buildIdentity(),
    audio: full ? audio : { schemaVersion: audio.schemaVersion, firstAudioFailure: audio.firstAudioFailure },
    retainedFailures: full ? retained : retained.map(failureSummary),
  };
  // A current GL record keeps its established top-level keys in full support.
  // Production exposes only failure summaries; details never mount implicitly.
  return JSON.stringify(sanitized({ ...(full ? current : current.label === 'FIRST_FAILURE' || Object.keys(object(current.firstFailure)).length ? failureSummary(current) : {}), support }), null, 2);
}
