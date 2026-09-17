import { boundedDiagnosticText } from '../platform/diagnosticText';
import type { AudioSourceId, GalleryAudioOptions } from './types';

type Value = string | number | boolean | null;
type Fields = Readonly<Record<string, Value | undefined>>;
export type AudioDiagnosticEvent = { sequence: number; relativeMs: number; ownerId: number; phase: string; fields: Record<string, Value> };
type Context = Pick<Owner, 'stageId' | 'campaignAreaId' | 'campaignSessionId' | 'runtimeSession' | 'sessionId'>;
export type AudioFailure = Context & { ownerId: number; phase: string; source: AudioSourceId | null; name: string; message: string; relativeMs: number };
type Owner = { ownerId: number; stageId: string | null; campaignAreaId: string | null; campaignSessionId: string | null; runtimeSession: number | null; sessionId: string; players: number; active: boolean; generation: number };
type Session = { generation: number; desiredActive: boolean; appliedActive: boolean | null; leases: number; pendingOperations: number };
const LIMIT = 64;
let sequence = 0, nextOwner = 0, start = Date.now();
let events: AudioDiagnosticEvent[] = [];
let firstAudioFailure: AudioFailure | null = null;
const owners = new Map<number, Owner>();
let session: Session = { generation: 0, desiredActive: false, appliedActive: null, leases: 0, pendingOperations: 0 };
const relativeMs = () => Math.max(0, Date.now() - start);
const text = (value: unknown) => boundedDiagnosticText(value, 160);

function context(ownerId: number): Context {
  const owner = owners.get(ownerId);
  return { stageId: owner?.stageId ?? null, campaignAreaId: owner?.campaignAreaId ?? null, campaignSessionId: owner?.campaignSessionId ?? null, runtimeSession: owner?.runtimeSession ?? null, sessionId: owner?.sessionId ?? 'none' };
}
export function recordAudioEvent(ownerId: number, phase: string, fields: Fields = {}) {
  const safe: Record<string, Value> = {};
  for (const [key, value] of Object.entries({ ...context(ownerId), ...fields }).slice(0, 21)) {
    if (value === undefined || typeof value === 'number' && !Number.isFinite(value)) continue;
    safe[text(key)] = typeof value === 'string' ? text(value) : value;
  }
  events.push({ sequence: ++sequence, relativeMs: relativeMs(), ownerId, phase: text(phase), fields: safe });
  if (events.length > LIMIT) events.splice(0, events.length - LIMIT);
}
export function recordAudioFailure(ownerId: number, error: unknown, phase: string, source?: AudioSourceId) {
  const failure: AudioFailure = { ...context(ownerId), ownerId, phase: text(phase), source: source ?? null, name: text(error instanceof Error ? error.name : 'Error'), message: text(error instanceof Error ? error.message : error), relativeMs: relativeMs() };
  firstAudioFailure ??= failure;
  recordAudioEvent(ownerId, 'failure', { ...failure });
}
export function registerAudioOwner(options: GalleryAudioOptions) {
  const ownerId = ++nextOwner;
  owners.set(ownerId, { ownerId, stageId: options.areaId ? text(options.areaId) : null, campaignAreaId: options.campaignAreaId ? text(options.campaignAreaId) : null,
    campaignSessionId: options.campaignSessionId ? text(options.campaignSessionId) : null, runtimeSession: Number.isFinite(options.runtimeSession) ? options.runtimeSession! : null,
    sessionId: text(options.sessionId), players: 0, active: false, generation: 0 });
  recordAudioEvent(ownerId, 'owner-created', { ...owners.get(ownerId)! });
  return ownerId;
}
export function updateAudioOwner(ownerId: number, patch: Partial<Pick<Owner, 'players' | 'active' | 'generation'>>) {
  const owner = owners.get(ownerId); if (owner) Object.assign(owner, patch);
}
export function retireAudioOwner(ownerId: number) { recordAudioEvent(ownerId, 'owner-disposed'); owners.delete(ownerId); }
export function updateAudioSession(patch: Session) { session = { ...patch }; }

/** Explicit support snapshot only. No URI, native UUID, device ID, stack or audio sampling. */
export function getAudioSupportSnapshot() {
  return { schemaVersion: 1 as const, firstAudioFailure: firstAudioFailure ? { ...firstAudioFailure } : null,
    events: events.map(event => ({ ...event, fields: { ...event.fields } })), owners: [...owners.values()].slice(-8).map(owner => ({ ...owner })),
    liveOwners: owners.size, livePlayers: [...owners.values()].reduce((sum, owner) => sum + owner.players, 0), session: { ...session },
    hearingVerified: false as const };
}
export function resetAudioDiagnosticsForTests() {
  owners.clear(); events = []; firstAudioFailure = null; sequence = nextOwner = 0; start = Date.now();
  session = { generation: 0, desiredActive: false, appliedActive: null, leases: 0, pendingOperations: 0 };
}
