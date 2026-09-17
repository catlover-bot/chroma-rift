import { recordAudioEvent, recordAudioFailure, updateAudioSession } from './diagnostics';
import type { AudioSessionLease } from './types';

/** Sole caller of global activation. Native operations are serialized: if a last
 * lease's false is already in flight, the next owner's readiness waits for true. */
export function createAudioSessionCoordinator(native: { prepare(): Promise<void>; setActive(active: boolean): Promise<void> }) {
  const leases = new Map<number, { active: boolean; generation: number }>();
  let generation = 0, configured = false, applied: boolean | null = null;
  let work: Promise<void> | undefined;
  const desired = () => [...leases.values()].some(lease => lease.active);
  const snapshot = () => updateAudioSession({ generation, desiredActive: desired(), appliedActive: applied, leases: leases.size, pendingOperations: work ? 1 : 0 });
  function reconcile(ownerId: number): Promise<void> {
    if (work) return work;
    let failed = false;
    work = Promise.resolve().then(async () => {
      while (desired() !== applied) {
        if (desired() && !configured) { recordAudioEvent(ownerId, 'global-prepare-start', { generation }); await native.prepare(); configured = true; recordAudioEvent(ownerId, 'global-prepare-complete', { generation }); }
        const target = desired();
        recordAudioEvent(ownerId, 'global-active-start', { target, generation });
        await native.setActive(target); applied = target;
        recordAudioEvent(ownerId, 'global-active-complete', { target, generation });
      }
    }).catch(error => { failed = true; applied = null; configured = false; recordAudioFailure(ownerId, error, 'global-session'); throw error; }).finally(() => {
      work = undefined; snapshot();
      if (!failed && desired() !== applied) void reconcile(ownerId).catch(() => undefined);
    });
    snapshot(); return work;
  }
  return {
    acquire(ownerId: number): AudioSessionLease {
      const lease = { active: false, generation: 0 }; leases.set(ownerId, lease); snapshot();
      return {
        async activate() {
          if (!leases.has(ownerId)) return false;
          lease.active = true; const ownGeneration = ++lease.generation; generation++; snapshot();
          await reconcile(ownerId);
          if (!leases.has(ownerId) || !lease.active || ownGeneration !== lease.generation) { recordAudioEvent(ownerId, 'obsolete-session-completion', { ownGeneration, generation: lease.generation }); return false; }
          // A request arriving between final loop evaluation and finally may need one more pass.
          if (applied !== true) await reconcile(ownerId);
          return leases.has(ownerId) && lease.active && ownGeneration === lease.generation && applied === true;
        },
        deactivate(reason) {
          if (!leases.has(ownerId) || !lease.active) return;
          lease.active = false; lease.generation++; generation++; recordAudioEvent(ownerId, 'lease-inactive', { reason, generation });
          void reconcile(ownerId).catch(() => undefined); snapshot();
        },
        dispose() {
          if (!leases.delete(ownerId)) return;
          lease.active = false; lease.generation++; generation++; recordAudioEvent(ownerId, 'lease-disposed', { generation });
          void reconcile(ownerId).catch(() => undefined); snapshot();
        },
      };
    },
  };
}
