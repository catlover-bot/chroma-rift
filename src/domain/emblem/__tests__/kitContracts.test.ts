import { buildCoverage, checkpointSeal, createSealStimulus, GLYPHS, linearToSrgb, neutralRGB, PALETTES, parseHex, reduceSeal, relativeLuminance, sampleColor, sealHint, srgbToLinear, startSealSession, type PlayContext, type SealAction, type SealState } from '..';

const context: PlayContext = { rendererReady: true, foreground: true, targetId: 'emblem-panel' };
function dispatch(state: SealState, action: SealAction, overrides: Partial<PlayContext> = {}) {
  return reduceSeal(state, { sessionId: state.sessionId, seq: state.lastSeq + 1, nowMs: state.lastNowMs + 1500, action }, { ...context, ...overrides });
}

// Original kit contracts absent from the earlier preview-derived cases.
// The read-only audit script separately executes the unchanged original Node cases.
describe('verified original kit contracts', () => {
  it('keeps each palette immutable so cached and newly generated stimuli cannot diverge', () => {
    expect(Object.isFrozen(PALETTES)).toBe(true);
    for (const palette of Object.values(PALETTES)) {
      expect(Object.isFrozen(palette)).toBe(true);
      const original = palette.red;
      expect(Reflect.set(palette, 'red', '#000000')).toBe(false);
      expect(palette.red).toBe(original);
    }
  });

  it('rejects malformed colors, channels, coverage and unsupported texture sizes explicitly', () => {
    for (const invalid of ['red', '#fff', '#12345678', '#GG1234']) expect(() => parseHex(invalid)).toThrow(RangeError);
    for (const invalid of [-1, 256, NaN, Infinity]) expect(() => srgbToLinear(invalid)).toThrow(RangeError);
    for (const invalid of [-1, 2, NaN, Infinity]) expect(() => linearToSrgb(invalid)).toThrow(RangeError);
    for (const invalid of [-1, 2, NaN, Infinity]) expect(() => sampleColor([0, 0, 0], [255, 255, 255], invalid, 'color')).toThrow(RangeError);
    for (const invalid of [0, 64, 4096, 128.5, NaN]) expect(() => buildCoverage(createSealStimulus(21), invalid)).toThrow(RangeError);
  });

  it('round-trips every 8-bit sRGB channel and retains the original palette luminance tolerance', () => {
    for (let value = 0; value <= 255; value++) expect(linearToSrgb(srgbToLinear(value))).toBe(value);
    for (const palette of Object.values(PALETTES)) for (const hex of [palette.red, palette.blue, palette.background]) {
      const rgb = parseHex(hex), neutral = neutralRGB(rgb);
      expect(neutral[0]).toBe(neutral[1]); expect(neutral[1]).toBe(neutral[2]);
      expect(Math.abs(relativeLuminance(rgb) - relativeLuminance(neutral))).toBeLessThan(0.004);
    }
  });

  it('retains deterministic separate contours, a substantial gap, every glyph and both radial roles over 100 seeds', () => {
    const answers = new Set<string>(), roles = new Set<boolean>();
    for (let seed = 0; seed < 100; seed++) {
      const stimulus = createSealStimulus(seed), mask = buildCoverage(stimulus, 128);
      expect(createSealStimulus(seed)).toEqual(stimulus);
      answers.add(stimulus.answer); roles.add(stimulus.geometryKey.includes('-outer-'));
      expect(stimulus.answer).not.toBe(stimulus.distractor);
      const closed = stimulus.paths[0]!.points, open = stimulus.paths[1]!.points;
      expect(Math.hypot(closed[0]!.x - closed.at(-1)!.x, closed[0]!.y - closed.at(-1)!.y)).toBeLessThan(1e-8);
      expect(Math.hypot(open[0]!.x - open.at(-1)!.x, open[0]!.y - open.at(-1)!.y)).toBeGreaterThan(0.04);
      expect(stimulus.paths[0]!.width).toBe(stimulus.paths[1]!.width);
      expect(mask.continuous.some(value => value > 0)).toBe(true);
      expect(mask.broken.some(value => value > 0)).toBe(true);
      expect(mask.continuous.some((value, index) => value > 0 && mask.broken[index]! > 0)).toBe(false);
    }
    expect(answers).toEqual(new Set(GLYPHS)); expect(roles.size).toBe(2);
  });

  it('rejects non-finite, fractional, duplicated and reversed event metadata without changing observation', () => {
    const state = dispatch(startSealSession(21, 'current'), { type: 'inspect' }).state;
    for (const [seq, nowMs] of [[state.lastSeq, 9999], [state.lastSeq + 1, 0], [99, NaN], [99, Infinity], [1.5, 9999], [Infinity, 9999], [99, -1]]) {
      const result = reduceSeal(state, { sessionId: state.sessionId, seq: seq!, nowMs: nowMs!, action: { type: 'inspect' } }, context);
      expect(result.reason).toBe('stale'); expect(result.state).toBe(state); expect(result.effects).toEqual([]);
    }
  });

  it('requires a ready foreground renderer to resume and clears controls on pause and resume', () => {
    const paused = dispatch(startSealSession(21, 'current'), { type: 'pause' });
    expect(paused.effects).toContainEqual({ type: 'stop-input' });
    for (const blocked of [{ foreground: false }, { rendererReady: false }]) {
      const result = dispatch(paused.state, { type: 'resume' }, blocked);
      expect(result.reason).toBe('blocked'); expect(result.state).toBe(paused.state);
    }
    const resumed = dispatch(paused.state, { type: 'resume' });
    expect(resumed.state.paused).toBe(false); expect(resumed.effects).toContainEqual({ type: 'stop-input' });
  });

  it('caps voluntary hints and allows assistance during pause without releasing the seal or adding attempts', () => {
    let state = dispatch(startSealSession(21, 'current'), { type: 'pause' }).state;
    for (let index = 0; index < 5; index++) {
      const result = dispatch(state, { type: 'hint' });
      expect(result.effects).toEqual([]); state = result.state;
    }
    const assisted = dispatch(state, { type: 'assist', enabled: true });
    expect(assisted.state).toMatchObject({ hintTier: 3, assist: true, phase: 'unexamined', attempts: 0, paused: true });
    expect(assisted.effects).toEqual([]); expect(sealHint(assisted.state)).toContain('輪郭');
  });

  it('keeps frozen state intact on a wrong target and emits no repeated unlock after checkpoint reentry', () => {
    const state = Object.freeze(dispatch(startSealSession(21, 'current'), { type: 'inspect' }).state);
    const glyph = createSealStimulus(state.seed).answer;
    const wrong = dispatch(state, { type: 'choose', glyph }, { targetId: 'key' });
    expect(wrong.reason).toBe('wrong-target'); expect(wrong.state).toBe(state); expect(wrong.effects).toEqual([]);
    const compared = dispatch(state, { type: 'compare' }).state;
    const solved = dispatch(compared, { type: 'choose', glyph }, { targetId: `emblem-${glyph}` });
    expect(solved.effects.filter(effect => effect.type === 'seal-released')).toHaveLength(1);
    const saved = checkpointSeal(solved.state);
    expect(Object.keys(saved).sort()).toEqual(['schemaVersion', 'seed', 'phase', 'attempts', 'hintTier', 'assist', 'compared'].sort());
    const reentered = startSealSession(21, 'next', saved);
    expect(reentered).toMatchObject({ phase: 'released', compared: true, presentation: 'color', lastSeq: -1, lastNowMs: 0, lastCompareMs: null, paused: false });
    expect(dispatch(reentered, { type: 'choose', glyph }, { targetId: `emblem-${glyph}` }).effects).toEqual([]);
    expect(state.phase).toBe('observing');
  });

  it('solves all original 32 seed cases with red, blue or unknown preference and no comparison prerequisite', () => {
    for (let seed = 1; seed <= 32; seed++) for (const preference of ['red', 'blue', 'unknown'] as const) {
      const state = dispatch(startSealSession(seed, `trial-${seed}`), { type: 'inspect' }).state;
      const glyph = createSealStimulus(seed, 'muted', preference).answer;
      const solved = dispatch(state, { type: 'choose', glyph }, { targetId: `emblem-${glyph}` });
      expect(solved.state).toMatchObject({ phase: 'released', compared: false, attempts: 0 });
      expect(solved.effects.filter(effect => effect.type === 'seal-released')).toHaveLength(1);
    }
  });
});
