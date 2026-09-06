import type { Point2, SampleId, ShadowCheckpoint, ShadowSlotId, SourceSlotId } from './types';

export const SAMPLE_IDS = ['sample-a', 'sample-b', 'sample-c'] as const;
export const SHADOW_SAMPLE_SIZE = 0.42;
/** Shared acquisition margin in board units; adjacent samples remain disjoint. */
export const SHADOW_HIT_SLOP = 0.06;
export const SHADOW_PAIR_COLOR = '#808080';
export const SHADOW_BACKGROUND = '#707070';
export const SHADOW_CONTEXTS = [
  { x: -0.8, y: 0.3, width: 0.72, height: 0.94, color: '#252525', style: 'dark-window' },
  { x: 0, y: 0.3, width: 0.72, height: 0.94, color: '#E0E0E0', style: 'light-window' },
  { x: 0.8, y: 0.3, width: 0.72, height: 0.94, color: '#535353', style: 'shelf-window' },
] as const;
export const SHADOW_COMPARISON = { x: 0, y: -0.52, width: 1.4, height: 0.48, color: '#707070' } as const;
export const SHADOW_SLOT_POSITIONS: Record<ShadowSlotId, Point2> = {
  'source-a': { x: -0.8, y: 0.3 }, 'source-b': { x: 0, y: 0.3 }, 'source-c': { x: 0.8, y: 0.3 },
  'socket-left': { x: -0.34, y: -0.52 }, 'socket-right': { x: 0.34, y: -0.52 },
};
export function sourceSlot(sampleId: SampleId): SourceSlotId { return ('source-' + sampleId.slice(-1)) as SourceSlotId; }
/** Six authored assignments move the unequal sample and select its canonical gray.
 * The same immutable color is used in its context and on the comparison shelf. */
export function createShadowSpec(seed: number, variant = seed % 6) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(variant) || variant < 0 || variant > 5) throw new RangeError('Invalid shadow seed or variant.');
  const distractor = variant % 3;
  return { seed, variant, samples: SAMPLE_IDS.map((id, index) => ({ id, sourceSlot: sourceSlot(id),
    color: index === distractor ? variant < 3 ? '#B0B0B0' : '#505050' : SHADOW_PAIR_COLOR,
    rgba: index === distractor ? variant < 3 ? [176, 176, 176, 255] as const : [80, 80, 80, 255] as const : [128, 128, 128, 255] as const,
  })), contexts: SHADOW_CONTEXTS, slots: SHADOW_SLOT_POSITIONS };
}
export function initialShadow(seed: number): ShadowCheckpoint {
  const spec = createShadowSpec(seed);
  return { seed, variant: spec.variant, inspected: false, solved: false, attempts: 0,
    assignments: { 'sample-a': 'source-a', 'sample-b': 'source-b', 'sample-c': 'source-c' } };
}
export function validShadowAssignments(assignments: Record<SampleId, ShadowSlotId>): boolean {
  const slots = SAMPLE_IDS.map(id => assignments[id]);
  return new Set(slots).size === 3 && SAMPLE_IDS.every(id => assignments[id] === sourceSlot(id) || assignments[id] === 'socket-left' || assignments[id] === 'socket-right');
}
export function placeShadowSample(state: ShadowCheckpoint, sampleId: SampleId, slotId: ShadowSlotId): ShadowCheckpoint {
  if (state.solved || !SAMPLE_IDS.includes(sampleId) || !(slotId === sourceSlot(sampleId) || slotId === 'socket-left' || slotId === 'socket-right')) return state;
  const assignments = { ...state.assignments };
  const displaced = SAMPLE_IDS.find(id => id !== sampleId && assignments[id] === slotId);
  if (displaced) assignments[displaced] = sourceSlot(displaced);
  assignments[sampleId] = slotId;
  return validShadowAssignments(assignments) ? { ...state, assignments } : state;
}
export function shadowPairMatches(state: ShadowCheckpoint): boolean {
  if (!validShadowAssignments(state.assignments)) return false;
  const left = SAMPLE_IDS.find(id => state.assignments[id] === 'socket-left');
  const right = SAMPLE_IDS.find(id => state.assignments[id] === 'socket-right');
  if (!left || !right || left === right) return false;
  const samples = createShadowSpec(state.seed, state.variant).samples;
  const first = samples.find(sample => sample.id === left)!, second = samples.find(sample => sample.id === right)!;
  const third = samples.find(sample => sample.id !== left && sample.id !== right)!;
  return first.color === second.color && first.color !== third.color;
}
export function shadowSlotAt(point: Point2): ShadowSlotId | null {
  if (![point.x, point.y].every(Number.isFinite)) return null;
  return (Object.keys(SHADOW_SLOT_POSITIONS) as ShadowSlotId[]).find(slot => {
    const center = SHADOW_SLOT_POSITIONS[slot];
    return Math.abs(point.x - center.x) <= 0.22 && Math.abs(point.y - center.y) <= 0.22;
  }) ?? null;
}
