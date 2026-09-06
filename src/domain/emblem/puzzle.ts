import { createSealStimulus, GLYPHS, type Glyph } from './stimulus';
import type { Presentation } from './color';

export const SEAL_VERSION = 1;
export const COMPARE_COOLDOWN_MS = 1000;
export const EMBLEM_SEED = 21;
export const GLYPH_LABELS: Record<Glyph, string> = { circle: '丸', diamond: 'ひし形', square: '四角' };
export type SealCheckpoint = { schemaVersion: 1; seed: number; phase: 'unexamined' | 'observing' | 'released'; attempts: number; hintTier: 0 | 1 | 2 | 3; assist: boolean; compared: boolean };
export type SealState = SealCheckpoint & { presentation: Presentation; sessionId: string; lastSeq: number; lastNowMs: number; lastCompareMs: number | null; paused: boolean };
export type SealAction = { type: 'pause' | 'resume' | 'hint' | 'compare' | 'inspect' } | { type: 'assist'; enabled: boolean } | { type: 'choose'; glyph: Glyph };
export type SealCommand = { sessionId: string; seq: number; nowMs: number; action: SealAction };
export type PlayContext = { rendererReady: boolean; foreground: boolean; targetId: string | null };
export type SealEffect = { type: 'message'; text: string } | { type: 'stop-input' } | { type: 'haptic'; kind: 'selection' } | { type: 'seal-released'; id: 'emblem-seal'; seed: number };
export type SealResult = { state: SealState; effects: SealEffect[]; accepted: boolean; reason: 'stale' | 'blocked' | 'accepted' | 'wrong-target' | 'cooldown' | 'already-complete' | 'inspect-first' };
const message = (text: string): SealEffect => ({ type: 'message', text });
export function startSealSession(seed: number, sessionId: string, checkpoint?: SealCheckpoint): SealState {
  createSealStimulus(seed);
  if (!sessionId || sessionId.length > 120) throw new RangeError('A fresh, non-empty session identifier is required.');
  if (checkpoint && (checkpoint.seed !== seed || checkpoint.schemaVersion !== SEAL_VERSION)) throw new RangeError('Mismatched checkpoint.');
  return { schemaVersion: SEAL_VERSION, seed, phase: checkpoint?.phase ?? 'unexamined', attempts: checkpoint?.attempts ?? 0,
    hintTier: checkpoint?.hintTier ?? 0, assist: checkpoint?.assist ?? false, compared: checkpoint?.compared ?? false,
    presentation: 'color', sessionId, lastSeq: -1, lastNowMs: 0, lastCompareMs: null, paused: false };
}
export function checkpointSeal(s: SealCheckpoint): SealCheckpoint {
  return { schemaVersion: SEAL_VERSION, seed: s.seed, phase: s.phase, attempts: s.attempts, hintTier: s.hintTier, assist: s.assist, compared: s.compared };
}
/** Semantic port of supplied reducer. Host verifies context, never UI-provided targets. */
export function reduceSeal(state: SealState, command: SealCommand, context: PlayContext): SealResult {
  const reject = (reason: SealResult['reason'], effects: SealEffect[] = []): SealResult => ({ state, effects, accepted: false, reason });
  if (command.sessionId !== state.sessionId || !Number.isSafeInteger(command.seq) || command.seq <= state.lastSeq ||
      !Number.isFinite(command.nowMs) || command.nowMs < state.lastNowMs || command.nowMs < 0) return reject('stale');
  const action = command.action;
  const commit = (partial: Partial<SealState>, effects: SealEffect[] = []): SealResult => ({
    state: { ...state, ...partial, lastSeq: command.seq, lastNowMs: command.nowMs }, effects, accepted: true, reason: 'accepted',
  });
  if (action.type === 'pause') return commit({ paused: true }, [{ type: 'stop-input' }]);
  if (action.type === 'resume') {
    if (!context.foreground || !context.rendererReady) return reject('blocked');
    return commit({ paused: false }, [{ type: 'stop-input' }]);
  }
  if (action.type === 'hint') return commit({ hintTier: Math.min(3, state.hintTier + 1) as SealCheckpoint['hintTier'] });
  if (action.type === 'assist') return commit({ assist: action.enabled });
  if (state.paused || !context.foreground || !context.rendererReady) return reject('blocked');
  if (action.type === 'compare') {
    if (context.targetId !== 'emblem-panel') return reject('wrong-target');
    if (state.lastCompareMs !== null && command.nowMs - state.lastCompareMs < COMPARE_COOLDOWN_MS) return reject('cooldown');
    const presentation = state.presentation === 'color' ? 'neutral' : 'color';
    return commit({ presentation, compared: true, lastCompareMs: command.nowMs }, [message(presentation === 'neutral' ? '色だけを外した。輪郭も、壁も変わっていない。' : '色を戻した。')]);
  }
  if (action.type === 'inspect') {
    if (context.targetId !== 'emblem-panel') return reject('wrong-target');
    if (state.phase === 'released') return reject('already-complete');
    // Inspect feedback can be read again, but observation is committed only once.
    if (state.phase === 'observing') return reject('already-complete', [message('触れた指は、壁で止まる。')]);
    return commit({ phase: 'observing' }, [message('触れた指は、壁で止まる。')]);
  }
  if (action.type === 'choose') {
    if (!GLYPHS.includes(action.glyph) || context.targetId !== 'emblem-' + action.glyph) return reject('wrong-target');
    if (state.phase === 'released') return reject('already-complete');
    if (state.phase === 'unexamined') return reject('inspect-first', [message('まず壁の紋章を調べよう。')]);
    if (action.glyph !== createSealStimulus(state.seed).answer) return commit({ attempts: Math.min(999, state.attempts + 1) }, [message('印は戻った。色ではなく、切れ目を確かめよう。')]);
    return commit({ phase: 'released' }, [
      { type: 'seal-released', id: 'emblem-seal', seed: state.seed }, { type: 'haptic', kind: 'selection' },
      message('封印が外れた。奥の扉が開いている。'),
    ]);
  }
  return reject('blocked');
}
export function sealHint(state: Pick<SealCheckpoint, 'hintTier'>): string {
  return [
    '壁の紋章を調べる',
    '浮いて見えるかより、線がどこへ続くかを見てみよう。',
    '二つの輪郭のうち、一つには切れ目がある。「色をほどく」で比べられる。',
    '切れずに一周できる輪郭と、同じ形の印を押そう。「輪郭ガイド」でも確認できる。',
  ][state.hintTier]!;
}
export function sealDescription(seed: number): string {
  const stimulus = createSealStimulus(seed);
  return '同じ壁面の二つの輪郭。' + GLYPH_LABELS[stimulus.answer] + 'の線は切れずにつながり、' +
    GLYPH_LABELS[stimulus.distractor] + 'の線には切れ目があります。形と同じ印が壁のそばに三つあります。';
}
export function parseSealCheckpoint(value: unknown): SealCheckpoint | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== SEAL_VERSION || typeof v.seed !== 'number' || !Number.isInteger(v.seed) || v.seed < 0 || v.seed > 0xffffffff ||
    !['unexamined', 'observing', 'released'].includes(v.phase as string) || typeof v.attempts !== 'number' || !Number.isInteger(v.attempts) || v.attempts < 0 || v.attempts > 999 ||
    typeof v.hintTier !== 'number' || !Number.isInteger(v.hintTier) || v.hintTier < 0 || v.hintTier > 3 || typeof v.assist !== 'boolean' || typeof v.compared !== 'boolean') return undefined;
  return checkpointSeal(v as SealCheckpoint);
}
