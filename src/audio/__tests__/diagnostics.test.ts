import { getAudioSupportSnapshot, recordAudioEvent, recordAudioFailure, registerAudioOwner, resetAudioDiagnosticsForTests, retireAudioOwner } from '../diagnostics';

beforeEach(resetAudioDiagnosticsForTests);
it('bounds events and strings, preserves first failure after disposal, returns detached snapshots and never claims hearing', () => {
  const id = registerAudioOwner({ sessionId: 'runtime', areaId: 'gallery-v1', campaignSessionId: 'campaign', campaignAreaId: '02', runtimeSession: 7 });
  const error = new Error('first https://private.invalid/token token=secret a@b.example /var/mobile/secret/path 123e4567-e89b-12d3-a456-426614174000');
  error.name = 'NativeAudioError'; recordAudioFailure(id, error, 'prepare');
  for (let i = 0; i < 200; i++) recordAudioEvent(id, 'bounded', { index: i, unbounded: 'x'.repeat(500), invalid: Infinity });
  recordAudioFailure(id, new Error('later'), 'play'); retireAudioOwner(id);
  const snapshot = getAudioSupportSnapshot();
  expect(snapshot.events).toHaveLength(64); expect(snapshot.hearingVerified).toBe(false); expect(snapshot.liveOwners).toBe(0);
  expect(snapshot.firstAudioFailure).toMatchObject({ name: 'NativeAudioError', phase: 'prepare', stageId: 'gallery-v1', campaignAreaId: '02', campaignSessionId: 'campaign', runtimeSession: 7, sessionId: 'runtime' });
  expect(JSON.stringify(snapshot)).not.toMatch(/private\.invalid|secret|a@b\.example|123e4567-e89b|Infinity/);
  expect(snapshot.events.filter(event => event.phase === 'bounded').every(event => String(event.fields.unbounded).length === 160 && !('invalid' in event.fields))).toBe(true);
  snapshot.events[0]!.fields.index = -1; snapshot.firstAudioFailure!.message = 'changed';
  expect(getAudioSupportSnapshot().events[0]!.fields.index).not.toBe(-1); expect(getAudioSupportSnapshot().firstAudioFailure!.message).not.toBe('changed');
});
