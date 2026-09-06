import { PerspectiveCamera } from 'three';
import { createCheckpoint, createInitialRuntime, evaluateRuntime, getWorld, hintForRuntime, interact, isSafePose, MOVE_SPEED, pauseRuntime, restoreCheckpoint, setHintStage, updatePlayer, type ChapterRuntime, type PlayerPose, type Vec3 } from '../../firstPerson';
import { angularDifference, applyGalleryCommand, cancelGalleryManipulation, CONTOUR_TOLERANCE, contourAligned, contourInkAt, createContourSpec, createGalleryRuntime, createShadowSpec, GALLERY_CHAPTER_ID, GALLERY_CONTOUR_FIXTURE, GALLERY_SHADOW_FIXTURE, GALLERY_LIGHT_FIXTURE, GALLERY_EXIT_PANEL_FIXTURE, galleryDeviceStatus, galleryPowerCount, contourAlignedCount, migrateGalleryV1Checkpoint, normalizeAngle, parseGalleryProgress, placeShadowSample, restoreGalleryCheckpoint, SAMPLE_IDS, SHADOW_HIT_SLOP, SHADOW_SAMPLE_SIZE, SHADOW_SLOT_POSITIONS, shadowPairMatches, sourceSlot, type DiscAngles, type GalleryAction, type GalleryPuzzle } from '..';

function matrices(pose: PlayerPose) {
  const camera = new PerspectiveCamera(65, 390 / 844, 0.08, 60);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
  return { view: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] };
}
function aim(runtime: ChapterRuntime, target: Vec3): ChapterRuntime {
  const dx = target.x - runtime.pose.position.x, dz = target.z - runtime.pose.position.z;
  return { ...runtime, pose: { ...runtime.pose, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(target.y - runtime.pose.position.y, Math.hypot(dx, dz)) } };
}
function walk(runtime: ChapterRuntime, x: number, z: number): ChapterRuntime {
  let next = runtime;
  for (let index = 0; index < 2200; index++) {
    if (next.progress.cleared) return next;
    const dx = x - next.pose.position.x, dz = z - next.pose.position.z, distance = Math.hypot(dx, dz);
    if (distance < 0.02) return next;
    next = { ...next, pose: { ...next.pose, yaw: Math.atan2(-dx, -dz), pitch: 0 } };
    const dt = Math.min(1 / 60, distance / MOVE_SPEED);
    next = evaluateRuntime(next, updatePlayer(next.pose, { strafe: 0, forward: 1 }, dt, getWorld(next)), dt);
  }
  throw new Error(`Collision route blocked: ${JSON.stringify(next.pose.position)} toward ${x},${z}`);
}
function act(runtime: ChapterRuntime, action: GalleryAction, target?: string) {
  const live = runtime.gallery!;
  const panel = target ?? (action.type === 'enter' ? action.puzzle : live.mode) + '-panel';
  return applyGalleryCommand(runtime, { sessionId: live.sessionId, seq: live.lastSeq + 1, nowMs: live.lastNowMs + 1001, action }, { rendererReady: true, foreground: true, targetId: panel });
}
function fresh(): ChapterRuntime { return createGalleryRuntime(); }
function solve(runtime: ChapterRuntime, puzzle: GalleryPuzzle): ChapterRuntime {
  let next = act(runtime, { type: 'enter', puzzle }).runtime;
  if (puzzle === 'shadow') {
    const pair = createShadowSpec(next.progress.gallery!.shadow.seed, next.progress.gallery!.shadow.variant).samples.filter(sample => sample.color === '#808080');
    next = act(next, { type: 'shadow-place', sampleId: pair[0]!.id, slotId: 'socket-left' }).runtime;
    next = act(next, { type: 'shadow-place', sampleId: pair[1]!.id, slotId: 'socket-right' }).runtime;
    const result = act(next, { type: 'shadow-commit' });
    expect(result.effects.filter(effect => effect.type === 'gallery-released')).toHaveLength(1);
    next = result.runtime;
  } else {
    for (const disc of createContourSpec(next.progress.gallery!.contour.seed).discs) next = act(next, { type: 'contour-adjust', discId: disc.id, delta: normalizeAngle(disc.targetAngle - next.gallery!.contourAngles[disc.id]) }).runtime;
    const result = act(next, { type: 'contour-commit' });
    expect(result.effects.filter(effect => effect.type === 'gallery-released')).toHaveLength(1);
    next = result.runtime;
  }
  return act(next, { type: 'leave' }).runtime;
}

describe('gallery authored perception contracts', () => {
  it('selects an explicit new-run seed once and retains it across checkpoint resume without changing A', () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 0xffffffff]) {
      const runtime = createGalleryRuntime(undefined, undefined, seed);
      expect(runtime.progress.gallery).toMatchObject({ seed, shadow: { seed, variant: seed % 6 }, contour: { seed } });
      expect(runtime.emblem.seed).toBe(21);
      const restored = restoreGalleryCheckpoint(createCheckpoint(runtime))!;
      expect(createGalleryRuntime(restored.checkpoint, undefined, 999).progress.gallery).toEqual(runtime.progress.gallery);
    }
    expect(() => createGalleryRuntime(undefined, undefined, NaN)).toThrow(RangeError);
  });
  it('authors all unequal sample identities with both distractor grays and unchanged canonical interiors', () => {
    const ids = new Set<string>(), grays = new Set<string>();
    for (let variant = 0; variant < 6; variant++) {
      const spec = createShadowSpec(73, variant), pair = spec.samples.filter(sample => sample.color === '#808080'), different = spec.samples.find(sample => sample.color !== '#808080')!;
      expect(pair).toHaveLength(2); expect(pair[0]!.id).not.toBe(pair[1]!.id);
      expect(pair[0]!.rgba).toEqual(pair[1]!.rgba); expect(pair[0]!.rgba).toEqual([128, 128, 128, 255]);
      expect(different.rgba).not.toEqual(pair[0]!.rgba); expect(different.rgba[3]).toBe(255);
      ids.add(different.id); grays.add(different.color);
      let state = { ...fresh().progress.gallery!.shadow, variant };
      state = placeShadowSample(state, pair[0]!.id, 'socket-left'); state = placeShadowSample(state, pair[1]!.id, 'socket-right');
      expect(shadowPairMatches(state)).toBe(true); expect(createShadowSpec(state.seed, state.variant).samples).toEqual(spec.samples);
    }
    expect(ids).toEqual(new Set(SAMPLE_IDS)); expect(grays).toEqual(new Set(['#B0B0B0', '#505050']));
  });
  it('keeps samples one-to-one when replacing sockets and rejects duplicated/foreign sample identities', () => {
    const initial = fresh().progress.gallery!.shadow;
    let state = placeShadowSample(initial, 'sample-a', 'socket-left');
    state = placeShadowSample(state, 'sample-b', 'socket-left');
    expect(state.assignments['sample-a']).toBe('source-a'); expect(state.assignments['sample-b']).toBe('socket-left');
    state = placeShadowSample(state, 'sample-b', 'socket-right');
    expect(Object.values(state.assignments).filter(slot => slot === 'socket-left')).toHaveLength(0);
    expect(shadowPairMatches({ ...state, assignments: { ...state.assignments, 'sample-a': 'socket-right' } })).toBe(false);
    expect(placeShadowSample(state, 'foreign' as 'sample-a', 'socket-left')).toBe(state);
    expect(placeShadowSample(state, 'sample-a', 'source-b')).toBe(state);
  });
  it('preserves grabbed sample offset, last confirmed slot and seed across outside drop, cancellation and pause', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'shadow' }).runtime;
    const saved = runtime.progress.gallery!.shadow, center = SHADOW_SLOT_POSITIONS['source-a'];
    runtime = act(runtime, { type: 'shadow-start', sampleId: 'sample-a', pointerId: 1, point: { x: center.x + 0.1, y: center.y } }).runtime;
    const grabbed = runtime.gallery!.activeDrag;
    expect(grabbed).toMatchObject({ point: center, offset: { y: 0 } });
    if (grabbed?.kind !== 'shadow') throw new Error('Shadow drag was not created');
    expect(grabbed.offset.x).toBeCloseTo(0.1, 14);
    runtime = act(runtime, { type: 'shadow-move', pointerId: 1, point: { x: 0.5, y: -0.4 } }).runtime;
    expect(runtime.gallery!.activeDrag).toMatchObject({ point: { x: 0.4, y: -0.4 } });
    expect(runtime.progress.gallery!.shadow).toBe(saved);
    runtime = act(runtime, { type: 'shadow-drop', pointerId: 1, slotId: null }).runtime;
    expect(runtime.progress.gallery!.shadow).toBe(saved);
    runtime = act(runtime, { type: 'shadow-start', sampleId: 'sample-a', pointerId: 2, point: center }).runtime;
    expect(act(runtime, { type: 'shadow-start', sampleId: 'sample-b', pointerId: 3, point: SHADOW_SLOT_POSITIONS['source-b'] }).reason).toBe('invalid');
    expect(cancelGalleryManipulation(runtime).gallery!.activeDrag).toBeNull();
    const paused = pauseRuntime(runtime);
    expect(paused.gallery).toMatchObject({ activeDrag: null, mode: 'explore' }); expect(paused.progress.gallery!.shadow).toBe(saved);
  });
  it('acquires the larger B sample margin without jumping or overlapping adjacent targets', () => {
    const runtime = act(fresh(), { type: 'enter', puzzle: 'shadow' }).runtime;
    const center = SHADOW_SLOT_POSITIONS['source-b'], halfHit = SHADOW_SAMPLE_SIZE / 2 + SHADOW_HIT_SLOP;
    for (const sign of [-1, 1]) {
      const start = act(runtime, { type: 'shadow-start', sampleId: 'sample-b', pointerId: 1, point: { x: center.x + sign * (halfHit - 1e-6), y: center.y } });
      expect(start.accepted).toBe(true); expect(start.runtime.gallery!.activeDrag).toMatchObject({ point: center });
      expect(act(runtime, { type: 'shadow-start', sampleId: 'sample-b', pointerId: 1, point: { x: center.x + sign * (halfHit + 1e-6), y: center.y } }).reason).toBe('invalid');
    }
    expect(SHADOW_SLOT_POSITIONS['source-b'].x - SHADOW_SLOT_POSITIONS['source-a'].x).toBeGreaterThan(2 * halfHit);
    expect(SHADOW_SLOT_POSITIONS['socket-right'].x - SHADOW_SLOT_POSITIONS['socket-left'].x).toBeGreaterThan(2 * halfHit);
    expect(runtime.progress.gallery!.shadow.assignments).toEqual(fresh().progress.gallery!.shadow.assignments);
  });
  it('requires explicit distinct-pair commit, gives recoverable wrong feedback and releases once without comparison', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'shadow' }).runtime;
    expect(act(runtime, { type: 'shadow-commit' }).reason).toBe('blocked');
    runtime = act(runtime, { type: 'shadow-place', sampleId: 'sample-a', slotId: 'socket-left' }).runtime;
    runtime = act(runtime, { type: 'shadow-place', sampleId: 'sample-b', slotId: 'socket-right' }).runtime;
    const wrong = act(runtime, { type: 'shadow-commit' });
    expect(wrong.runtime.progress.gallery!.shadow).toMatchObject({ solved: false, attempts: 1 }); expect(wrong.effects.some(effect => effect.type === 'gallery-released')).toBe(false);
    runtime = solve(wrong.runtime, 'shadow');
    expect(runtime.progress.gallery!.order).toEqual(['B']); expect(runtime.gallery!.shadowCompare).toBe(false);
    runtime = act(runtime, { type: 'enter', puzzle: 'shadow' }).runtime;
    expect(act(runtime, { type: 'shadow-commit' }).reason).toBe('already-complete');
  });
  it('derives three distinct target directions and wedge boundaries from the actual triangle vertices', () => {
    const spec = createContourSpec(73);
    expect(new Set(spec.discs.map(disc => disc.targetAngle)).size).toBe(3);
    for (const disc of spec.discs) {
      expect(disc.targetAngle).toBeCloseTo(Math.atan2(spec.centroid.y - disc.center.y, spec.centroid.x - disc.center.x), 12);
      for (const other of spec.discs.filter(other => other.id !== disc.id)) expect(angularDifference(Math.atan2(other.center.y - disc.center.y, other.center.x - disc.center.x), disc.targetAngle)).toBeCloseTo(Math.PI / 6, 12);
      const edge = Math.hypot(spec.discs[0]!.center.x - spec.discs[1]!.center.x, spec.discs[0]!.center.y - spec.discs[1]!.center.y);
      expect(disc.radius / edge).toBeGreaterThan(0.22); expect(disc.radius / edge).toBeLessThan(0.28);
    }
  });
  it('leaves the central triangle as plain background in normal mode and defines assistance as a separate guide', () => {
    const spec = createContourSpec(73), angles = spec.discs.map(disc => disc.targetAngle);
    expect(spec.normalLayers).toEqual(['background', 'inducers']); expect(spec.guide).toMatchObject({ dashed: true, label: '輪郭ガイド' });
    for (let a = 1; a < 16; a++) for (let b = 1; b < 16 - a; b++) {
      const c = 16 - a - b;
      const point = { x: (spec.discs[0]!.center.x * a + spec.discs[1]!.center.x * b + spec.discs[2]!.center.x * c) / 16, y: (spec.discs[0]!.center.y * a + spec.discs[1]!.center.y * b + spec.discs[2]!.center.y * c) / 16 };
      expect(contourInkAt(point, angles)).toBe(false);
    }
  });
  it('handles wrap and exact tolerance boundaries using the displayed angles without requiring a perceived triangle', () => {
    const angles = createContourSpec(73).discs.map(disc => disc.targetAngle) as DiscAngles;
    expect(contourAligned(73, angles.map(angle => angle + 4 * Math.PI))).toBe(true);
    expect(contourAligned(73, [angles[0] + CONTOUR_TOLERANCE, angles[1], angles[2]])).toBe(true);
    expect(contourAligned(73, [angles[0] + CONTOUR_TOLERANCE + 0.0001, angles[1], angles[2]])).toBe(false);
    expect(angularDifference(-Math.PI + 0.01, Math.PI - 0.01)).toBeCloseTo(0.02, 12);
  });
  it('keeps drag rotation sign, pickup continuity and committed angles when a drag is cancelled', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'contour' }).runtime;
    const disc = createContourSpec(73).discs[0]!, initial = runtime.gallery!.contourAngles[0];
    runtime = act(runtime, { type: 'contour-start', discId: 0, pointerId: 1, point: { x: disc.center.x + 0.2, y: disc.center.y } }).runtime;
    runtime = act(runtime, { type: 'contour-move', pointerId: 1, point: { x: disc.center.x, y: disc.center.y + 0.2 } }).runtime;
    expect(angularDifference(runtime.gallery!.contourAngles[0], initial + Math.PI / 2)).toBeLessThan(1e-10);
    expect(runtime.progress.gallery!.contour.angles[0]).toBe(initial);
    expect(act(runtime, { type: 'contour-commit' }).reason).toBe('blocked');
    runtime = act(runtime, { type: 'contour-end', pointerId: 1 }).runtime;
    const committed = runtime.gallery!.contourAngles[0];
    runtime = act(runtime, { type: 'contour-start', discId: 0, pointerId: 2, point: { x: disc.center.x, y: disc.center.y - 0.2 } }).runtime;
    expect(runtime.gallery!.contourAngles[0]).toBe(committed);
    runtime = act(runtime, { type: 'contour-move', pointerId: 2, point: { x: disc.center.x + 0.2, y: disc.center.y } }).runtime;
    const paused = pauseRuntime(runtime);
    expect(paused.gallery!.contourAngles[0]).toBe(committed); expect(paused.gallery!.activeDrag).toBeNull();
  });
  it('rebases after crossing the disc center dead zone instead of jumping by half a turn', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'contour' }).runtime;
    const disc = createContourSpec(73).discs[0]!, before = runtime.gallery!.contourAngles[0];
    runtime = act(runtime, { type: 'contour-start', discId: 0, pointerId: 1, point: { x: disc.center.x + 0.2, y: disc.center.y } }).runtime;
    runtime = act(runtime, { type: 'contour-move', pointerId: 1, point: disc.center }).runtime;
    runtime = act(runtime, { type: 'contour-move', pointerId: 1, point: { x: disc.center.x - 0.2, y: disc.center.y } }).runtime;
    expect(runtime.gallery!.contourAngles[0]).toBe(before);
    runtime = act(runtime, { type: 'contour-move', pointerId: 1, point: { x: disc.center.x, y: disc.center.y - 0.2 } }).runtime;
    expect(angularDifference(runtime.gallery!.contourAngles[0], before + Math.PI / 2)).toBeLessThan(1e-10);
  });
  it('blocks inactive, stale and wrong-panel commands and comparison/guide never solve either puzzle', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'shadow' }).runtime;
    runtime = act(runtime, { type: 'compare' }).runtime;
    expect(runtime.progress.gallery!.shadow.solved).toBe(false);
    runtime = act(runtime, { type: 'enter', puzzle: 'contour' }).runtime;
    runtime = act(runtime, { type: 'guide', enabled: true }).runtime;
    expect(runtime.progress.gallery!.contour.solved).toBe(false);
    const command = { sessionId: runtime.gallery!.sessionId, seq: runtime.gallery!.lastSeq + 1, nowMs: runtime.gallery!.lastNowMs + 1, action: { type: 'contour-commit' } as const };
    for (const context of [{ rendererReady: false, foreground: true }, { rendererReady: true, foreground: false }]) expect(applyGalleryCommand(runtime, command, { ...context, targetId: 'contour-panel' }).reason).toBe('blocked');
    expect(applyGalleryCommand(runtime, { ...command, sessionId: 'old' }, { rendererReady: true, foreground: true, targetId: 'contour-panel' }).reason).toBe('stale');
    expect(applyGalleryCommand(runtime, command, { rendererReady: true, foreground: true, targetId: 'shadow-panel' }).reason).toBe('wrong-target');
    expect(applyGalleryCommand(pauseRuntime(runtime), command, { rendererReady: true, foreground: true, targetId: 'contour-panel' }).reason).toBe('blocked');
  });
  it('shares a 1000 ms presentation cooldown between shadow comparison and the contour guide across modes', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'shadow' }).runtime;
    runtime = act(runtime, { type: 'compare' }).runtime;
    const switchedAt = runtime.gallery!.lastNowMs;
    const send = (action: GalleryAction, nowMs: number, targetId: string) => applyGalleryCommand(runtime, { sessionId: runtime.gallery!.sessionId, seq: runtime.gallery!.lastSeq + 1, nowMs, action }, { rendererReady: true, foreground: true, targetId });
    runtime = send({ type: 'enter', puzzle: 'contour' }, switchedAt + 1, 'contour-panel').runtime;
    const tooSoon = send({ type: 'guide', enabled: true }, switchedAt + 999, 'contour-panel');
    expect(tooSoon.reason).toBe('cooldown'); expect(tooSoon.runtime.gallery!.contourGuide).toBe(false); runtime = tooSoon.runtime;
    const allowed = send({ type: 'guide', enabled: true }, switchedAt + 1000, 'contour-panel');
    expect(allowed.accepted).toBe(true); expect(allowed.runtime.gallery!.contourGuide).toBe(true); runtime = allowed.runtime;
    expect(send({ type: 'guide', enabled: false }, switchedAt + 1999, 'contour-panel').reason).toBe('cooldown');
    expect(send({ type: 'guide', enabled: false }, switchedAt + 2000, 'contour-panel').runtime.gallery!.contourGuide).toBe(false);
    expect(runtime.progress.gallery!.shadow.solved).toBe(false); expect(runtime.progress.gallery!.contour.solved).toBe(false);
  });
  it('offers the active wing hint in either order and clears the ladder when that puzzle releases', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'contour' }).runtime;
    expect(hintForRuntime(runtime).target).toEqual(GALLERY_CONTOUR_FIXTURE.center);
    runtime = setHintStage(runtime, 3);
    expect(hintForRuntime(runtime).text).toContain('引き出し');
    runtime = solve(runtime, 'contour');
    runtime = act(runtime, { type: 'take-power', puzzle: 'contour' }, 'contour-panel').runtime;
    expect(runtime.progress.hintStage).toBe(0);
    expect(hintForRuntime(runtime).target).toEqual(GALLERY_SHADOW_FIXTURE.center);
  });
  it('saves only confirmed slots/angles, rejects malformed progress and preserves old chapter boundaries', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'shadow' }).runtime;
    runtime = act(runtime, { type: 'shadow-start', sampleId: 'sample-a', pointerId: 11, point: SHADOW_SLOT_POSITIONS[sourceSlot('sample-a')] }).runtime;
    runtime = act(runtime, { type: 'shadow-move', pointerId: 11, point: { x: 0.2, y: 0 } }).runtime;
    const checkpoint = createCheckpoint(runtime), restored = restoreGalleryCheckpoint(checkpoint)!;
    expect(restored.emblemStatus).toBe('valid'); expect(checkpoint.chapterId).toBe(GALLERY_CHAPTER_ID);
    expect(JSON.stringify(checkpoint)).not.toMatch(/pointerId|activeDrag|sessionId|lastNowMs|doorDOpen/);
    expect(createInitialRuntime(restored.checkpoint).gallery).toMatchObject({ activeDrag: null, mode: 'explore' });
    expect(checkpoint.progress.gallery!.shadow.assignments['sample-a']).toBe('source-a');
    expect(restoreCheckpoint(checkpoint)).toBeUndefined(); expect(restoreGalleryCheckpoint(createCheckpoint(createInitialRuntime()))).toBeUndefined();
    expect(restoreGalleryCheckpoint({ ...checkpoint, levelVersion: 99 })).toBeUndefined();
    expect(parseGalleryProgress({ ...checkpoint.progress.gallery, order: ['B', 'B'] })).toBeUndefined();
    expect(parseGalleryProgress({ ...checkpoint.progress.gallery, contour: { ...checkpoint.progress.gallery!.contour, angles: [NaN, 0, 0] } })).toBeUndefined();
    expect(createInitialRuntime().progress.gallery).toBeUndefined();
  });
});

describe('revised gallery entry and power route', () => {
  it('removes old A/D gates and keeps light, optional comparison and legacy flags independent of progress', () => {
    let runtime = fresh();
    const before = getWorld(runtime);
    expect(before.interactables.some(target => target.id.startsWith('emblem-') || target.id === 'key')).toBe(false);
    expect(before.solids.some(solid => ['seal-a-door', 'seal-b-door', 'gallery-key-door', 'gallery-return-door'].includes(solid.id))).toBe(false);
    expect(before.keyFragments).toEqual([]);
    expect(act(runtime, { type: 'enter', puzzle: 'shadow' }).accepted).toBe(true);
    runtime = act(runtime, { type: 'light-on' }, 'gallery-light').runtime;
    expect(runtime.progress.gallery!.emergencyLit).toBe(true);
    expect(act(runtime, { type: 'light-on' }, 'gallery-light').reason).toBe('already-complete');
    const pose = runtime.pose, progress = runtime.progress;
    runtime = act(runtime, { type: 'chromatic-compare' }, 'chromatic-exhibit').runtime;
    expect(runtime.gallery!.chromaticNeutral).toBe(true); expect(runtime.pose).toBe(pose); expect(runtime.progress).toBe(progress);
    expect(getWorld(runtime)).toEqual(before);
    expect(getWorld({ ...runtime, progress: { ...runtime.progress, sealA: true, sealB: true, variant: 'exit' } })).toEqual(before);
  });
  it('keeps B 0/1/2 guidance and explicit commit eligibility consistent and preserves wrong feedback until replacement', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'shadow' }).runtime;
    expect(galleryDeviceStatus(runtime)).toMatchObject({ count: 0, commitEnabled: false, instruction: '見本を1枚、下の枠へドラッグ' });
    runtime = act(runtime, { type: 'shadow-place', sampleId: 'sample-a', slotId: 'socket-left' }).runtime;
    expect(galleryDeviceStatus(runtime)).toMatchObject({ count: 1, commitEnabled: false, instruction: 'もう1枚を、隣の枠へ' });
    runtime = act(runtime, { type: 'shadow-place', sampleId: 'sample-b', slotId: 'socket-right' }).runtime;
    expect(galleryDeviceStatus(runtime)).toMatchObject({ count: 2, commitEnabled: true });
    runtime = act(runtime, { type: 'shadow-commit' }).runtime;
    for (let i = 0; i < 120; i++) runtime = evaluateRuntime(runtime, runtime.pose, 1 / 30);
    expect(galleryDeviceStatus(runtime)?.instruction).toBe('明るさが違う。どちらかを入れ替えよう。');
    runtime = act(runtime, { type: 'shadow-place', sampleId: 'sample-c', slotId: 'socket-right' }).runtime;
    expect(galleryDeviceStatus(runtime)?.instruction).toContain('比べる');
  });
  it('shares C display angles with every 0/3..3/3 count and refuses incomplete activation without increasing attempts', () => {
    let runtime = act(fresh(), { type: 'enter', puzzle: 'contour' }).runtime;
    expect(galleryDeviceStatus(runtime)).toMatchObject({ count: 0, commitEnabled: false });
    for (const disc of createContourSpec(runtime.progress.gallery!.seed).discs) {
      expect(act(runtime, { type: 'contour-commit' }).reason).toBe('blocked');
      runtime = act(runtime, { type: 'contour-adjust', discId: disc.id, delta: normalizeAngle(disc.targetAngle - runtime.gallery!.contourAngles[disc.id]) }).runtime;
      expect(contourAlignedCount(runtime.progress.gallery!.seed, runtime.gallery!.contourAngles)).toBe(disc.id + 1);
      expect(galleryDeviceStatus(runtime)?.commitEnabled).toBe(disc.id === 2);
    }
    expect(runtime.progress.gallery!.contour.attempts).toBe(0);
    expect(act(runtime, { type: 'contour-commit' }).runtime.progress.gallery!.contour.solved).toBe(true);
  });
  it('requires explicit exact-once pickups and atomic two-power connection, retaining progress through reload', () => {
    let runtime = fresh();
    expect(act(runtime, { type: 'take-power', puzzle: 'shadow' }, 'shadow-panel').reason).toBe('blocked');
    for (const [i, puzzle] of (['shadow', 'contour'] as const).entries()) {
      runtime = solve(runtime, puzzle);
      expect(galleryPowerCount(runtime.progress.gallery!)).toBe(i);
      const pickup = act(runtime, { type: 'take-power', puzzle }, puzzle + '-panel');
      expect(pickup.effects.filter(e => e.type === 'power-taken')).toHaveLength(1); runtime = pickup.runtime;
      expect(act(runtime, { type: 'take-power', puzzle }, puzzle + '-panel').reason).toBe('already-complete');
      expect(galleryPowerCount(runtime.progress.gallery!)).toBe(i + 1);
      if (!i) expect(act(runtime, { type: 'connect-power' }, 'gallery-exit-panel').reason).toBe('blocked');
    }
    const connected = act(runtime, { type: 'connect-power' }, 'gallery-exit-panel'); runtime = connected.runtime;
    expect(connected.effects.filter(e => e.type === 'power-connected')).toHaveLength(1);
    expect(runtime.progress).toMatchObject({ sealA: false, sealB: false, variant: 'entrance', gallery: { powerConnected: true, powerTaken: { shadow: true, contour: true } } });
    expect(act(runtime, { type: 'connect-power' }, 'gallery-exit-panel').reason).toBe('already-complete');
    expect(createGalleryRuntime(restoreGalleryCheckpoint(createCheckpoint(runtime))!.checkpoint).progress).toEqual(runtime.progress);
  });
  it('migrates v1 unfinished, solved, old D and cleared records without mutating their raw structures', () => {
    for (const stage of [0, 1, 2, 3, 4]) {
      let runtime = fresh();
      if (stage >= 1) runtime = solve(runtime, 'shadow');
      if (stage >= 2) runtime = solve(runtime, 'contour');
      const checkpoint = createCheckpoint(runtime), legacy = JSON.parse(JSON.stringify(checkpoint));
      legacy.levelVersion = 1;
      legacy.progress.gallery = { schemaVersion: 1, seed: runtime.progress.gallery!.seed, shadow: runtime.progress.gallery!.shadow, contour: runtime.progress.gallery!.contour, order: runtime.progress.gallery!.order };
      legacy.progress.sealA = stage > 0; legacy.progress.emblem.phase = stage > 0 ? 'released' : 'unexamined';
      legacy.progress.sealB = stage >= 3; legacy.progress.variant = stage >= 3 ? 'exit' : 'entrance';
      legacy.progress.exitDoorOpen = stage === 4; legacy.progress.cleared = stage === 4;
      legacy.pose = { position: { x: 500, y: 1.6, z: -500 }, yaw: 0, pitch: 0 };
      const before = JSON.stringify(legacy), result = migrateGalleryV1Checkpoint(legacy)!;
      expect(result).toBeDefined(); expect(JSON.stringify(legacy)).toBe(before);
      expect(result.checkpoint.levelVersion).toBe(2);
      expect(result.checkpoint.progress.gallery).toMatchObject({ powerTaken: { shadow: stage >= 1, contour: stage >= 2 }, powerConnected: stage >= 3, completedFromV1: stage === 4 });
      expect(result.checkpoint.progress.cleared).toBe(stage === 4);
      expect(restoreGalleryCheckpoint(result.checkpoint)?.recovered).toBe(false);
      expect(migrateGalleryV1Checkpoint({ ...legacy, levelVersion: 3 })).toBeUndefined();
    }
  });
  it.each([['shadow', 'contour'], ['contour', 'shadow']] as const)('walks light → %s → %s → power connection → service → actual outside', (first, second) => {
    let runtime = fresh();
    runtime = aim(runtime, GALLERY_LIGHT_FIXTURE.center); runtime = interact(runtime, 'gallery-light', matrices(runtime.pose));
    expect(runtime.progress.gallery!.emergencyLit).toBe(true);
    runtime = aim(runtime, GALLERY_EXIT_PANEL_FIXTURE.center); runtime = interact(runtime, 'gallery-exit-panel', matrices(runtime.pose));
    expect(runtime.progress.gallery!.exitInspected).toBe(true);
    runtime = walk(runtime, 0, -10);
    for (const puzzle of [first, second]) {
      if (puzzle === 'shadow') runtime = walk(walk(walk(runtime, -3, -9.6), -7, -9.6), -7, -10.7);
      else runtime = walk(walk(runtime, 9, -10), 9, -10.7);
      runtime = aim(runtime, puzzle === 'shadow' ? GALLERY_SHADOW_FIXTURE.center : GALLERY_CONTOUR_FIXTURE.center);
      runtime = interact(runtime, puzzle === 'shadow' ? 'shadow-panel' : 'contour-panel', matrices(runtime.pose));
      expect(runtime.gallery!.mode).toBe(puzzle); runtime = solve(runtime, puzzle);
      runtime = act(runtime, { type: 'take-power', puzzle }, puzzle + '-panel').runtime;
      if (puzzle === 'shadow') runtime = walk(walk(walk(runtime, -7, -9.6), -3, -9.6), 0, -10);
      else runtime = walk(walk(runtime, 9, -10), 0, -10);
    }
    runtime = walk(runtime, 0, 2); runtime = aim(runtime, GALLERY_EXIT_PANEL_FIXTURE.center);
    runtime = interact(runtime, 'gallery-exit-panel', matrices(runtime.pose)); expect(runtime.progress.gallery!.powerConnected).toBe(true);
    runtime = walk(walk(walk(runtime, 0, 9), 4, 9), 4, 17);
    runtime = aim(runtime, getWorld(runtime).interactables.find(item => item.id === 'exit')!.center);
    runtime = interact(runtime, 'exit', matrices(runtime.pose)); expect(runtime.progress.exitDoorOpen).toBe(true);
    runtime = walk(runtime, 4, 19.5);
    expect(runtime.progress).toMatchObject({ sealA: false, sealB: false, variant: 'entrance', cleared: true });
    expect(isSafePose(runtime.pose, getWorld(runtime))).toBe(true);
    expect(createGalleryRuntime(restoreGalleryCheckpoint(createCheckpoint(runtime))!.checkpoint).progress.cleared).toBe(true);
  });
});
