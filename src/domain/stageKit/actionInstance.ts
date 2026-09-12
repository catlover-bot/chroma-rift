export type InputPolicy = Readonly<{
  move: boolean; look: boolean; pointer: 'none' | 'exclusive'; dangerAdvances: boolean; end: 'release' | 'explicit';
}>;
export type ActionAvailability = 'ready' | 'tooFar' | 'obstructed' | 'needsFraming' | 'busy' | 'prerequisiteMissing' | 'coolingDown' | 'completed';
export type ActionInstance = Readonly<{ instanceId: string; kind: 'bell' | 'shutter'; cooldownSeconds: number; input: InputPolicy }>;
export type ActionState = Readonly<{ cooldown: number; activations: number }>;

export function validateActionInstance(instance: ActionInstance): string[] {
  const errors: string[] = [];
  if (!/^[a-z][a-z0-9-]*$/.test(instance.instanceId)) errors.push('invalid instanceId');
  if (!Number.isFinite(instance.cooldownSeconds) || instance.cooldownSeconds < 0) errors.push('invalid cooldown');
  if (instance.input.pointer !== 'none' && instance.input.pointer !== 'exclusive') errors.push('invalid pointer policy');
  if (instance.input.end !== 'release' && instance.input.end !== 'explicit') errors.push('invalid end policy');
  return errors;
}
export function initialActionState(): ActionState { return { cooldown: 0, activations: 0 }; }
export function advanceActionState(state: ActionState, dt: number): ActionState {
  if (!Number.isFinite(dt) || dt <= 0 || state.cooldown <= 0) return state;
  return { ...state, cooldown: Math.max(0, state.cooldown - dt) };
}
export function activateAction(instance: ActionInstance, state: ActionState, available: ActionAvailability): { state: ActionState; accepted: boolean; reason: ActionAvailability } {
  if (available !== 'ready') return { state, accepted: false, reason: available };
  if (state.cooldown > 0) return { state, accepted: false, reason: 'coolingDown' };
  return { state: { cooldown: instance.cooldownSeconds, activations: state.activations + 1 }, accepted: true, reason: 'ready' };
}
