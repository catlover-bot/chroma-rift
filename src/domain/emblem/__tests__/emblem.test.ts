import { bottomUpRGBA, buildCoverage, checkpointSeal, createSealStimulus, createSealSurface, EMBLEM_SEED, getSealRasterPair, GLYPHS, PALETTE_IDS, PALETTES, parseSealCheckpoint, rasterizeSeal, reduceSeal, relativeLuminance, sealHint, srgbToLinear, startSealSession, type PaletteId, type SealAction, type SealRaster, type SealState } from '..';
import goldens from './preview-goldens.json';

const { createHash } = require('crypto') as { createHash(algorithm: string): { update(bytes: Uint8Array): { digest(format: 'hex'): string } } };

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const variantSeeds = Object.values(goldens.variants);

describe('supplied preview generator port: objective pixel evidence, not perception', () => {
  it('matches original compiled preview golden bytes across 15 seed/palette cases', () => {
    for (const record of goldens.records) {
      const stimulus = createSealStimulus(record.seed, record.palette as PaletteId);
      const mask = buildCoverage(stimulus, 128);
      expect(stimulus.answer).toBe(record.answer);
      expect(stimulus.geometryKey).toBe(record.geometryKey);
      expect(hash(mask.continuous)).toBe(record.continuous);
      expect(hash(mask.broken)).toBe(record.broken);
      expect(hash(rasterizeSeal(stimulus, mask, 'color').rgba)).toBe(record.color);
      expect(hash(rasterizeSeal(stimulus, mask, 'neutral').rgba)).toBe(record.neutral);
    }
  });
  it.each(variantSeeds)('keeps the answer, gap and mask across palettes/preferences for variant seed %s', (seed) => {
    const base = createSealStimulus(seed), mask = buildCoverage(base, 128);
    expect(base.paths[0]!.points[0]!.x).toBeCloseTo(base.paths[0]!.points.at(-1)!.x);
    expect(base.paths[0]!.points[0]!.y).toBeCloseTo(base.paths[0]!.points.at(-1)!.y);
    const broken = base.paths[1]!.points;
    expect(Math.hypot(broken[0]!.x - broken.at(-1)!.x, broken[0]!.y - broken.at(-1)!.y)).toBeGreaterThan(0.08);
    for (const palette of PALETTE_IDS) for (const preference of ['red', 'blue', 'unknown'] as const) {
      const s = createSealStimulus(seed, palette, preference);
      expect(s.answer).toBe(base.answer); expect(s.paths).toEqual(base.paths);
      const nextMask = buildCoverage(s, 128);
      expect(hash(nextMask.continuous)).toBe(hash(mask.continuous));
      expect(hash(nextMask.broken)).toBe(hash(mask.broken));
      expect(() => rasterizeSeal(s, mask, 'color')).not.toThrow();
    }
    expect(mask.continuous.some((value) => value === 255)).toBe(true);
    expect(mask.broken.some((value) => value === 255)).toBe(true);
    expect(mask.continuous.some((value, index) => value > 0 && mask.broken[index]! > 0)).toBe(false);
  });
  it('keeps all authored contours separate at both quality resolutions and has no hidden alpha cue', () => {
    for (const size of [128, 512]) for (const seed of variantSeeds) {
      const s = createSealStimulus(seed), mask = buildCoverage(s, size);
      expect(mask.continuous.some((value, i) => value > 0 && mask.broken[i]! > 0)).toBe(false);
      const color = rasterizeSeal(s, mask, 'color');
      expect(color.rgba.every((value, i) => i % 4 !== 3 || value === 255)).toBe(true);
      expect(color.width).toBe(size); expect(color.height).toBe(size);
    }
  });
  it('neutral retains each encoded color pixel luminance within the 8-bit rounding bound', () => {
    // Max derivative of inverse sRGB over [0,1] is 2.4/1.055.
    // Rounding encoded gray by <= .5/255 gives <= .004461 relative luminance error.
    const bound = 2.4 / 1.055 * 0.5 / 255;
    expect(bound).toBeLessThan(0.004461);
    for (const palette of PALETTE_IDS) for (const preference of ['red', 'blue', 'unknown'] as const) {
      const pair = getSealRasterPair(21, palette, preference, 128);
      let maximum = 0, opaqueNeutral = true;
      const grays = new Set<number>();
      for (let i = 0; i < pair.color.rgba.length; i += 4) {
        const a = pair.color.rgba, b = pair.neutral.rgba;
        maximum = Math.max(maximum, Math.abs(relativeLuminance([a[i]!, a[i + 1]!, a[i + 2]!]) - srgbToLinear(b[i]!)));
        opaqueNeutral &&= b[i] === b[i + 1] && b[i] === b[i + 2] && b[i + 3] === 255;
        grays.add(b[i]!);
      }
      expect(opaqueNeutral).toBe(true);
      expect(maximum).toBeLessThanOrEqual(bound + 1e-12);
      expect(grays.size).toBeGreaterThan(3);
    }
  });
  it('explicitly reverses row order for the same asymmetric top-down image in a DataTexture', () => {
    const pair = getSealRasterPair(EMBLEM_SEED, 'baseline', 'unknown', 128);
    const bottom = bottomUpRGBA(pair.color), stride = 128 * 4;
    expect(bottom).not.toEqual(pair.color.rgba);
    for (const row of [0, 30, 64, 97, 127]) expect(bottom.slice(row * stride, (row + 1) * stride)).toEqual(pair.color.rgba.slice((127 - row) * stride, (128 - row) * stride));
    expect(bottomUpRGBA({ ...pair.color, rgba: bottom })).toEqual(pair.color.rgba);
  });
  it('shares cached pairs and masks without coupling preference to geometry', () => {
    const a = getSealRasterPair(21, 'baseline', 'unknown');
    expect(getSealRasterPair(21, 'baseline', 'unknown')).toBe(a);
    const b = getSealRasterPair(21, 'muted', 'blue');
    expect(b.mask).toBe(a.mask); expect(b.stimulus.geometryKey).toBe(a.stimulus.geometryKey);
    expect(b.color.rgba).not.toEqual(a.color.rgba);
  });
  it('rejects malformed inputs and foreign masks rather than making a blank plate', () => {
    for (const seed of [-1, 1.2, NaN, Infinity, 0x100000000]) expect(() => createSealStimulus(seed)).toThrow();
    expect(() => buildCoverage(createSealStimulus(21), 127)).toThrow();
    expect(() => rasterizeSeal(createSealStimulus(21), buildCoverage(createSealStimulus(22), 128), 'color')).toThrow();
    expect(() => bottomUpRGBA({ width: 2, height: 1, rgba: new Uint8Array(3) } as SealRaster)).toThrow();
    expect(PALETTES.baseline.red).toBe('#EF3F48');
  });
});

function run(state: SealState, action: SealAction, targetId: string | null = 'emblem-panel', now = state.lastNowMs + 1001) {
  return reduceSeal(state, { sessionId: state.sessionId, seq: state.lastSeq + 1, nowMs: now, action },
    { rendererReady: true, foreground: true, targetId });
}
describe('ported semantic reducer, host integration tested separately', () => {
  it.each(variantSeeds)('solves seed %s with unknown preference and assistance without a color prerequisite', (seed) => {
    let state = startSealSession(seed, 'core-' + seed);
    state = run(state, { type: 'assist', enabled: true }).state;
    expect(state.phase).toBe('unexamined');
    state = run(state, { type: 'inspect' }).state;
    const result = run(state, { type: 'choose', glyph: createSealStimulus(seed, 'muted', 'unknown').answer }, 'emblem-' + createSealStimulus(seed).answer);
    expect(result.state.phase).toBe('released');
    expect(result.state.compared).toBe(false);
    expect(result.effects.filter((effect) => effect.type === 'seal-released')).toHaveLength(1);
    expect(run(result.state, { type: 'choose', glyph: createSealStimulus(seed).answer }, 'emblem-' + createSealStimulus(seed).answer).effects).toEqual([]);
  });
  it('records inspection once, gives wrong feedback, and preserves seed/observation/progress', () => {
    let state = startSealSession(21, 'core');
    const early = run(state, { type: 'choose', glyph: 'circle' }, 'emblem-circle');
    expect(early.reason).toBe('inspect-first');
    state = run(state, { type: 'inspect' }).state;
    expect(run(state, { type: 'inspect' }).state).toBe(state);
    const wrong = run(state, { type: 'choose', glyph: 'square' }, 'emblem-square');
    expect(wrong.state).toMatchObject({ seed: 21, phase: 'observing', attempts: 1 });
    expect(wrong.effects.some((effect) => effect.type === 'seal-released')).toBe(false);
  });
  it('comparison and all voluntary hints alone never unlock and comparison is bounded', () => {
    let state = startSealSession(21, 'core');
    const compared = run(state, { type: 'compare' });
    state = compared.state;
    expect(state).toMatchObject({ compared: true, presentation: 'neutral', phase: 'unexamined' });
    expect(run(state, { type: 'compare' }, 'emblem-panel', state.lastNowMs + 999).reason).toBe('cooldown');
    expect(run(state, { type: 'compare' }, 'emblem-panel', state.lastNowMs + 1000).state.presentation).toBe('color');
    for (let tier = 1; tier <= 3; tier++) {
      state = run(state, { type: 'hint' }).state;
      expect(state.hintTier).toBe(tier); expect(sealHint(state).length).toBeGreaterThan(12);
    }
    expect(state.phase).toBe('unexamined');
    expect(run(state, { type: 'compare' }, 'emblem-circle').reason).toBe('wrong-target');
  });
  it('rejects stale session, duplicate sequence, reversed time, pause/background/unready observation', () => {
    const initial = startSealSession(21, 'active');
    const first = run(initial, { type: 'inspect' }).state;
    const packet = { sessionId: 'active', seq: first.lastSeq, nowMs: first.lastNowMs, action: { type: 'inspect' } as SealAction };
    const context = { rendererReady: true, foreground: true, targetId: 'emblem-panel' };
    expect(reduceSeal(first, packet, context).reason).toBe('stale');
    expect(reduceSeal(first, { ...packet, sessionId: 'old', seq: 50 }, context).reason).toBe('stale');
    expect(reduceSeal(first, { ...packet, seq: 50, nowMs: 0 }, context).reason).toBe('stale');
    for (const blocked of [{ ...context, rendererReady: false }, { ...context, foreground: false }]) expect(reduceSeal(initial, { ...packet, seq: 1 }, blocked).state).toBe(initial);
    const paused = run(initial, { type: 'pause' }).state;
    expect(run(paused, { type: 'inspect' }).state).toBe(paused);
    expect(run(paused, { type: 'assist', enabled: true }).state.phase).toBe('unexamined');
  });
  it('persists only semantic fields and validates optional checkpoint data', () => {
    const state = run(startSealSession(21, 'core'), { type: 'inspect' }).state;
    const checkpoint = checkpointSeal(state);
    expect(Object.keys(checkpoint)).not.toContain('sessionId');
    expect(parseSealCheckpoint(checkpoint)).toEqual(checkpoint);
    expect(startSealSession(21, 'new', checkpoint)).toMatchObject({ phase: 'observing', lastSeq: -1, presentation: 'color', compared: false });
    for (const invalid of [{ ...checkpoint, schemaVersion: 2 }, { ...checkpoint, seed: -1 }, { ...checkpoint, attempts: Infinity }, { ...checkpoint, phase: 'fake' }, { ...checkpoint, assist: 'true' }]) expect(parseSealCheckpoint(invalid)).toBeUndefined();
    expect(GLYPHS).toHaveLength(3);
  });
});

describe('surface ownership at a mocked factory boundary', () => {
  it('swaps cached maps without new material/texture and disposes each once', () => {
    const texture = jest.fn(() => ({ dispose: jest.fn() }));
    const material = jest.fn((map: ReturnType<typeof texture>) => ({ map, dispose: jest.fn() }));
    const surface = createSealSurface(createSealStimulus(21), { texture, material }, 128);
    const owned = surface.material, color = owned.map;
    surface.setPresentation('neutral');
    expect(owned.map).not.toBe(color);
    surface.setPresentation('color'); expect(owned.map).toBe(color);
    expect(texture).toHaveBeenCalledTimes(2); expect(material).toHaveBeenCalledTimes(1);
    expect(material.mock.calls[0]).toHaveLength(2);
    surface.dispose(); surface.dispose();
    expect(owned.dispose).toHaveBeenCalledTimes(1);
    for (const entry of texture.mock.results) expect(entry.value.dispose).toHaveBeenCalledTimes(1);
    expect(() => surface.setPresentation('neutral')).toThrow();
  });
  it('disposes an already-created texture when the second allocation fails', () => {
    const dispose = jest.fn();
    const texture = jest.fn().mockReturnValueOnce({ dispose }).mockImplementationOnce(() => { throw new Error('allocation failed'); });
    expect(() => createSealSurface(createSealStimulus(21), { texture, material: jest.fn() }, 128)).toThrow('allocation failed');
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
