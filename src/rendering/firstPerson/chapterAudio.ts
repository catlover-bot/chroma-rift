import type { MusicState, GallerySoundEvent } from '../../audio';
import { isStageSession as isMirror } from '../../domain/stages/mirror-corridor-v1/session';
import { isStageSession as isDeparture } from '../../domain/stages/departure-control-v1/session';
import { KEY_CENTER, WINCH_CENTER } from '../../domain/stages/mirror-corridor-v1/definition';
import { BELL_RECEIVER, CONTROL_TARGETS } from '../../domain/stages/departure-control-v1/definition';
import type { RuntimeController } from './controllerTypes';

type AudibleState = { session: number; owner: RuntimeController['audio']; key: boolean; ratchets: number;
  holding: boolean; bell: number; doorClosing: boolean; isolated: boolean; stopped: boolean; releaseSeconds: number };
const previous = new WeakMap<RuntimeController, AudibleState>();

/** Called only beyond the existing successful native presentation boundary.
 * This observes committed facts; it never writes a stage, AI noise, or save. */
export function presentChapterAudio(controller: RuntimeController, delta: number): void {
  const owner = controller.audio, runtime = controller.runtime;
  if (!owner || controller.retired || runtime.paused || controller.diagnostics.appActive === false) return;
  const raw = runtime.stageSession?.value;
  const mirror = isMirror(raw) ? raw : undefined, departure = isDeparture(raw) ? raw : undefined;
  const actor = mirror?.actor ?? departure?.actor ?? runtime.gallery?.actor ?? runtime.vault?.actor ?? runtime.theatre?.actor;
  const next: AudibleState = { session: runtime.session, owner,
    key: !!(mirror?.keyTaken || departure?.keyInstalled), ratchets: mirror?.ratchets ?? 0,
    holding: !!mirror?.holding, bell: departure?.bellCooldown ?? 0,
    doorClosing: departure?.doorMode === 'closing', isolated: departure?.isolated ?? false,
    stopped: departure?.stopped ?? false, releaseSeconds: 0 };
  const old = previous.get(controller);
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, .05)) : 0;
  const emit = (type: GallerySoundEvent['type'], position: GallerySoundEvent['position']) => {
    owner.event({ type, ...(position ? { position } : {}), sessionId: String(runtime.session), sequence: ++controller.audioSequence });
  };
  // Consume the committed state before touching an external audio API. Even
  // a throwing backend cannot replay the same physical event next frame.
  previous.set(controller, next);
  if (old && old.session === runtime.session && old.owner === owner) {
    next.releaseSeconds = Math.max(0, old.releaseSeconds - dt);
    if (next.key && !old.key) emit('key', mirror ? KEY_CENTER : CONTROL_TARGETS.key);
    if (next.holding && !old.holding) emit('grip', WINCH_CENTER);
    if (next.ratchets > old.ratchets) { emit('ratchet', WINCH_CENTER); owner.duckMusic(.9, .3); }
    if (next.bell > old.bell + .1) { emit('bell', BELL_RECEIVER); owner.duckMusic(1.2, .4); }
    if (next.doorClosing && !old.doorClosing) { emit('isolation', CONTROL_TARGETS.isolation); owner.duckMusic(1.6, .25); }
    if (next.isolated && !old.isolated) next.releaseSeconds = 10;
    if (next.stopped && !old.stopped) { emit('power', CONTROL_TARGETS.power); owner.duckMusic(1.6, .25); }
  }
  const safe = next.isolated || next.stopped || runtime.progress.cleared;
  const phase = actor?.phase;
  const pursuit = !safe && controller.horrorIntensity !== 'subdued' && !!phase && ['pursue','approach','windup','attack'].includes(phase);
  const suspicion = !safe && !!phase && ['notice','noticed','investigate','search'].includes(phase);
  const state: MusicState = next.releaseSeconds > 0 ? 'release' : safe ? 'exploration' : pursuit ? 'pursuit' : suspicion ? 'suspicion' : 'exploration';
  owner.setEnvironment(departure?.stopped ? runtime.pose.position.z >= 22.2 ? 'outdoor' : 'silent' : 'indoor');
  owner.setMusicState(state, String(runtime.session));
  owner.advanceMusic(dt, String(runtime.session));
}
