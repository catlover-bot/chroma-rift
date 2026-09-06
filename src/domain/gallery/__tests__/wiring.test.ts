import { createCheckpoint, type ChapterRuntime } from '../../firstPerson';
import { applyGalleryCommand, createContourSpec, createGalleryRuntime, createShadowSpec, getWiringSpec, initialWiring, migrateGalleryV2Checkpoint, normalizeAngle, restoreGalleryCheckpoint, wiringAligned, WIRING_HANDLE_HIT_RADIUS, WIRING_TOLERANCE, type GalleryAction, type GalleryV2Progress } from '..';

function action(runtime: ChapterRuntime, payload: GalleryAction, targetId = 'wiring-panel') {
  const live = runtime.gallery!;
  return applyGalleryCommand(runtime, { sessionId: live.sessionId, seq: live.lastSeq + 1, nowMs: live.lastNowMs + 1001, action: payload }, { foreground: true, rendererReady: true, targetId });
}
function accepted(runtime: ChapterRuntime, payload: GalleryAction, targetId?: string) {
  const result = action(runtime, payload, targetId); expect(result.accepted).toBe(true); return result.runtime;
}
function prepared() {
  let runtime = createGalleryRuntime();
  for (const puzzle of ['shadow', 'contour'] as const) {
    const target = puzzle + '-panel'; runtime = accepted(runtime, { type: 'enter', puzzle }, target);
    if (puzzle === 'shadow') {
      const state = runtime.progress.gallery!.shadow, pair = createShadowSpec(state.seed, state.variant).samples.filter(sample => sample.color === '#808080');
      runtime = accepted(runtime, { type: 'shadow-place', sampleId: pair[0]!.id, slotId: 'socket-left' }, target);
      runtime = accepted(runtime, { type: 'shadow-place', sampleId: pair[1]!.id, slotId: 'socket-right' }, target);
      runtime = accepted(runtime, { type: 'shadow-commit' }, target);
    } else {
      for (const disc of createContourSpec(runtime.progress.gallery!.seed).discs) runtime = accepted(runtime, { type: 'contour-adjust', discId: disc.id, delta: normalizeAngle(disc.targetAngle - runtime.gallery!.contourAngles[disc.id]) }, target);
      runtime = accepted(runtime, { type: 'contour-commit' }, target);
    }
    runtime = accepted(runtime, { type: 'take-power', puzzle }, target); runtime = accepted(runtime, { type: 'leave' }, target);
  }
  runtime = accepted(runtime, { type: 'connect-power' }, 'gallery-exit-panel');
  return accepted(runtime, { type: 'enter', puzzle: 'wiring' });
}
function legacyTwo(runtime: ChapterRuntime) {
  const current = createCheckpoint(runtime), progress = current.progress.gallery!;
  const old: GalleryV2Progress = { schemaVersion: 2, seed: progress.seed, shadow: progress.shadow, contour: progress.contour, order: progress.order,
    emergencyLit: progress.emergencyLit, exitInspected: progress.exitInspected, powerTaken: progress.powerTaken, powerConnected: progress.powerConnected,
    completedFromV1: progress.completedFromV1, story: progress.story };
  return { ...current, levelVersion: 2, progress: { ...current.progress, gallery: old } };
}

describe('one center-line wiring puzzle, independently of the occluding cover', () => {
  it('uses one line equation and compares the actual endpoint gap at the authored tolerance', () => {
    for (const offset of [-.28, -WIRING_TOLERANCE, 0, WIRING_TOLERANCE, .28]) {
      const original = getWiringSpec({ offset, cover: 0 }), neutral = getWiringSpec({ offset, cover: -.97 });
      expect(neutral.fixedLine).toEqual(original.fixedLine); expect(neutral.movableLine).toEqual(original.movableLine);
      expect([neutral.m, neutral.b, neutral.offset, neutral.tolerance]).toEqual([original.m, original.b, original.offset, original.tolerance]);
      expect(original.movableLine[0].y - original.fixedLine[1].y).toBeCloseTo(offset, 12);
      expect(wiringAligned(offset)).toBe(Math.abs(offset) <= WIRING_TOLERANCE);
    }
    expect(wiringAligned(WIRING_TOLERANCE + .0001)).toBe(false); expect(wiringAligned(Number.NaN)).toBe(false);
  });
  it('preserves the grab offset, accepts a single pointer, commits only inside and rolls cancel back', () => {
    let runtime = prepared(); const initial = runtime.progress.gallery!.wiring;
    const center = getWiringSpec(initial).handles.line.center, grab = { x: center.x + WIRING_HANDLE_HIT_RADIUS * .7, y: center.y + .08 };
    runtime = accepted(runtime, { type: 'wiring-start', control: 'line', pointerId: 7, point: grab });
    expect(runtime.gallery!.wiringOffset).toBe(initial.offset);
    expect(action(runtime, { type: 'wiring-move', pointerId: 8, point: { ...grab, y: grab.y - .2 } }).accepted).toBe(false);
    runtime = accepted(runtime, { type: 'wiring-move', pointerId: 7, point: { ...grab, y: grab.y - .2 } });
    expect(runtime.gallery!.wiringOffset).toBeCloseTo(.04, 12); expect(runtime.progress.gallery!.wiring).toBe(initial);
    expect(action(runtime, { type: 'wiring-commit' }).accepted).toBe(false);
    runtime = accepted(runtime, { type: 'wiring-end', pointerId: 7, inside: false });
    expect(runtime.gallery!.wiringOffset).toBe(initial.offset); expect(runtime.progress.gallery!.wiring).toBe(initial);
    runtime = accepted(runtime, { type: 'wiring-start', control: 'line', pointerId: 9, point: center });
    runtime = accepted(runtime, { type: 'wiring-move', pointerId: 9, point: { ...center, y: center.y - .24 } });
    runtime = accepted(runtime, { type: 'cancel' }); expect(runtime.gallery!.wiringOffset).toBe(.24);
    runtime = accepted(runtime, { type: 'wiring-start', control: 'line', pointerId: 10, point: center });
    runtime = accepted(runtime, { type: 'wiring-move', pointerId: 10, point: { ...center, y: center.y - .24 } });
    runtime = accepted(runtime, { type: 'wiring-end', pointerId: 10, inside: true });
    expect(runtime.progress.gallery!.wiring.offset).toBeCloseTo(0, 12); expect(runtime.progress.gallery!.wiring.solved).toBe(false);
    expect(action(runtime, { type: 'wiring-end', pointerId: 10, inside: true }).accepted).toBe(false);
  });
  it('keeps errors at the chosen height and never requires comparison before exact-once connection', () => {
    let runtime = prepared(); const actor = runtime.gallery!.actor;
    runtime = accepted(runtime, { type: 'wiring-commit' });
    expect(runtime.progress.gallery!.wiring).toMatchObject({ offset: .24, cover: 0, solved: false, attempts: 1 });
    expect(runtime.gallery!.actor).toBe(actor);
    runtime = accepted(runtime, { type: 'wiring-adjust', control: 'line', delta: -.24 });
    expect(runtime.progress.gallery!.wiring.solved).toBe(false);
    const committed = action(runtime, { type: 'wiring-commit' }); expect(committed.accepted).toBe(true); runtime = committed.runtime;
    expect(committed.effects.filter(effect => effect.type === 'wiring-released')).toHaveLength(1);
    expect(runtime.progress.gallery!.wiring).toMatchObject({ offset: 0, cover: 0, solved: true, attempts: 1, compatibleBypass: false });
    expect(runtime.progress.gallery!.discoveries.wiring).toBe(true);
    expect(action(runtime, { type: 'wiring-commit' }).accepted).toBe(false);
    expect(restoreGalleryCheckpoint(createCheckpoint(runtime))!.checkpoint.progress.gallery!.wiring.solved).toBe(true);
  });
  it('moves only the cover during comparison, retaining camera, actor, solved state and line coordinates', () => {
    let runtime = prepared(); const pose = runtime.pose, actor = runtime.gallery!.actor, before = getWiringSpec(runtime.progress.gallery!.wiring);
    runtime = accepted(runtime, { type: 'wiring-adjust', control: 'cover', delta: 0 });
    expect(runtime.progress.gallery!.discoveries.wiring).toBe(false);
    runtime = accepted(runtime, { type: 'wiring-adjust', control: 'cover', delta: -.97 });
    expect(runtime.progress.gallery!.discoveries.wiring).toBe(true);
    const after = getWiringSpec(runtime.progress.gallery!.wiring);
    expect(after.cover.center.x).toBe(-.97); expect(after.fixedLine).toEqual(before.fixedLine); expect(after.movableLine).toEqual(before.movableLine);
    expect(runtime.pose).toBe(pose); expect(runtime.gallery!.actor).toBe(actor); expect(runtime.progress.gallery!.wiring.solved).toBe(false);
    expect(runtime.progress.gallery!.powerConnected).toBe(true);
  });
  it('rejects out-of-range inputs, stale sessions, blocked entry and active-drag replay', () => {
    const locked = createGalleryRuntime(); expect(action(locked, { type: 'enter', puzzle: 'wiring' }).accepted).toBe(false);
    let runtime = prepared();
    expect(action(runtime, { type: 'wiring-adjust', control: 'line', delta: Infinity }).accepted).toBe(false);
    expect(action(runtime, { type: 'wiring-start', control: 'cover', pointerId: 0, point: { x: 9, y: 9 } }).accepted).toBe(false);
    const live = runtime.gallery!;
    expect(applyGalleryCommand(runtime, { sessionId: live.sessionId + '-old', seq: live.lastSeq + 1, nowMs: live.lastNowMs + 1, action: { type: 'wiring-commit' } }, { foreground: true, rendererReady: true, targetId: 'wiring-panel' }).accepted).toBe(false);
    const center = getWiringSpec(runtime.progress.gallery!.wiring).handles.cover.center;
    runtime = accepted(runtime, { type: 'wiring-start', control: 'cover', pointerId: 1, point: center });
    runtime = accepted(runtime, { type: 'wiring-move', pointerId: 1, point: { x: -10, y: center.y } });
    expect(runtime.gallery!.wiringCover).toBe(-.97);
    runtime = accepted(runtime, { type: 'wiring-end', pointerId: 1, inside: true });
    expect(runtime.progress.gallery!.wiring.cover).toBe(-.97);
  });
  it('migrates v2 connected/end/clear progress without inventing a new discovery', () => {
    for (const state of ['fresh', 'connected', 'end', 'cleared'] as const) {
      const runtime = state === 'fresh' ? createGalleryRuntime() : prepared();
      if (state === 'end' || state === 'cleared') runtime.pose.position = { x: 4, y: 1.6, z: 17 };
      const legacy = legacyTwo(runtime);
      if (state === 'end' || state === 'cleared') legacy.pose = { position: { x: 4, y: 1.6, z: 17 }, yaw: Math.PI, pitch: 0 };
      if (state === 'cleared') { legacy.progress.exitDoorOpen = true; legacy.progress.cleared = true; }
      const source = JSON.stringify(legacy), migrated = migrateGalleryV2Checkpoint(legacy)!;
      expect(migrated.checkpoint.levelVersion).toBe(3); expect(migrated.checkpoint.progress.gallery!.wiring).toEqual(initialWiring(state !== 'fresh'));
      expect(Object.values(migrated.checkpoint.progress.gallery!.discoveries).some(Boolean)).toBe(false);
      expect(migrated.checkpoint.progress.gallery!.completedFromV2).toBe(state === 'cleared');
      expect(JSON.stringify(legacy)).toBe(source); expect(migrated.checkpoint.progress.gallery!.powerTaken).toEqual(legacy.progress.gallery.powerTaken);
      expect(restoreGalleryCheckpoint(migrated.checkpoint)).toBeDefined();
    }
  });
  it('rejects future schemas, forged completion and malformed discoveries without repairing them', () => {
    const checkpoint = createCheckpoint(prepared()), gallery = checkpoint.progress.gallery!;
    const check = (changed: unknown) => restoreGalleryCheckpoint({ ...checkpoint, progress: { ...checkpoint.progress, gallery: changed } });
    expect(check({ ...gallery, schemaVersion: 4 })).toBeUndefined();
    expect(check({ ...gallery, discoveries: { ...gallery.discoveries, mask: 'yes' } })).toBeUndefined();
    expect(check({ ...gallery, wiring: { ...gallery.wiring, solved: true } })).toBeUndefined();
    expect(check({ ...gallery, wiring: { ...gallery.wiring, compatibleBypass: true } })).toBeUndefined();
    expect(check({ ...gallery, finalDoorClosed: true })).toBeUndefined();
    expect(migrateGalleryV2Checkpoint({ ...legacyTwo(prepared()), levelVersion: 99 })).toBeUndefined();
  });
});
