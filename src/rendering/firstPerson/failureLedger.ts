// Navigation to chapter home unmounts the Canvas and screen controller. Keep
// only redacted, serialized failure snapshots from this app process in memory.
const MAX_FAILURES = 3;
let failures: string[] = [];

export function rememberFailureSnapshot(record: string): void {
  try { if (JSON.parse(record)?.label !== 'FIRST_FAILURE') return; } catch { return; }
  failures = [...failures, record.slice(0, 32768)].slice(-MAX_FAILURES);
}

export function recentFailureSnapshots(): readonly string[] { return [...failures]; }

// Used only by tests. A user-facing clear/reset action would risk losing the
// one record needed to investigate a recovery failure.
export function resetFailureSnapshotsForTest(): void { failures = []; }
