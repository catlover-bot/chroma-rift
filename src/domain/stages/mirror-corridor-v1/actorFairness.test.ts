import { MirrorFairRoute, type MirrorRouteOptions } from '../../../../test-support/mirrorFairRoute';
// Node-only optional evidence output; no application import reaches this file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as { writeFileSync(path: string, contents: string): void };

const measurements: unknown[] = [];
afterAll(() => {
  if (process.env.MIRROR_FAIRNESS_REPORT) fs.writeFileSync(process.env.MIRROR_FAIRNESS_REPORT, JSON.stringify({
    scope: 'Actual controller input, physics, actor, checkpoint and simulated successful presentations; no native Screen/GPU/audio or human reaction claim.',
    decisions: 'Real emitted footplant within4.5m; selected reaction delay; leave cover after successive actual footsteps recede beyond5.6m. These are QA perception thresholds, not human hearing measurements. No enemy phase, timer or memory read controls input.',
    measurements,
  }, null, 2));
});

const positions = [[-2.45, 9.6], [-2.05, 10.05], [-1.8, 10]] as const;
const clocks = [{ name: '60fps', deltas: [1 / 60] }, { name: '30fps', deltas: [1 / 30] },
  { name: 'variable', deltas: [1 / 120, 1 / 30, .022, .047] }] as const;
const routes = positions.flatMap(work => [0, 4, 9].flatMap(initialWait => [.75, 1.25, 1.75].flatMap(reaction => clocks.map(clock => ({
  name: `${work.join(',')}/wait${initialWait}/reaction${reaction}/${clock.name}`,
  options: { work, initialWait, reaction, deltas: clock.deltas, retreat: true } as MirrorRouteOptions,
})))));

test('standard real input reaches the visible exit without capture', () => {
  const result = new MirrorFairRoute({ initialWait: 0, work: [-2.45, 9.6], reaction: 1.25, deltas: [1 / 60], retreat: false }).run();
  expect(result.captures).toBe(0);
  expect(result.checkpoint.progress.cleared).toBe(true);
});

test('a real audible plant, delayed release, shelf retreat and return completes the standard route', () => {
  const result = new MirrorFairRoute({ initialWait: 0, work: [-2.45, 9.6], reaction: 1.25, deltas: [1 / 60], retreat: true }).run();
  const cue = result.events.find(event => event.name === 'firstDangerCue')!;
  const release = result.events.find(event => event.name === 'release' && event.time > cue.time)!;
  expect(release.time - cue.time).toBeGreaterThanOrEqual(1.25 - 1e-9);
  expect(release.time - cue.time).toBeLessThan(1.25 + 1 / 60 + 1e-9);
  expect(result.events.find(event => event.name === 'coverReached')!.ratchets).toBe(1);
  expect(result.captures).toBe(0);
  expect(result.checkpoint.progress.cleared).toBe(true);
});

test.each(clocks)('subdued $name keeps the actor present while allowing the physical exit', ({ deltas }) => {
  const driver = new MirrorFairRoute({ initialWait: 9, work: [-2.05, 10.05], reaction: 1.25, deltas, retreat: false, intensity: 'subdued' });
  const result = driver.run();
  expect(driver.session.actor.visible).toBe(true);
  expect(result.captures).toBe(0);
  expect(result.checkpoint.progress.cleared).toBe(true);
});

test('ordinary walking into the patrol lane after one tooth produces physical capture and safe recovery', () => {
  const driver = new MirrorFairRoute({ initialWait: 0, work: [-2.45, 9.6], reaction: 1.25, deltas: [1 / 60], retreat: false });
  driver.prepareWork();
  driver.hold('mirror-corridor-winch', { x: -2.45, y: 1.4, z: 11.3 });
  driver.wait(2.05); driver.release('mirror-corridor-winch');
  expect(driver.session.ratchets).toBe(1);
  driver.walk(-2.45, 9.3); driver.walk(0, 9.3); driver.walk(0, 13);
  for (let frame = 0; frame < 1800 && !driver.captures; frame++) driver.tick();
  expect(driver.captures).toBe(1);
  expect(driver.session).toMatchObject({ keyTaken: true, practiced: true, ratchets: 1, actor: { recoveryPending: true } });
  driver.assertSafe('physical-capture-recovery');
});

test.each(routes)('observable cue route $name', ({ options }) => {
  const driver = new MirrorFairRoute(options);
  try {
    const result = driver.run();
    const cue = result.events.find(event => event.name === 'firstDangerCue')!;
    const release = result.events.find(event => event.name === 'release' && event.time > cue.time)!;
    expect(release.time - cue.time).toBeGreaterThanOrEqual(options.reaction - 1e-9);
    expect(release.time - cue.time).toBeLessThan(options.reaction + Math.max(...options.deltas) + 1e-9);
    expect(result.captures).toBe(0);
    expect(result.checkpoint.progress.cleared).toBe(true);
    measurements.push({ ...result, outcome: 'completed-without-capture' });
  } catch (error) {
    const capture = driver.events.find(event => event.name === 'captureConfirmed');
    const cue = driver.events.find(event => event.name === 'firstDangerCue');
    const release = cue && driver.events.find(event => event.name === 'release' && event.time > cue.time);
    // 1.75s is a comparison case, not the required1.25s success guarantee.
    // A late first retreat may lose to an already telegraphed physical attack;
    // blockage, unsafe recovery and any failure during rework remain failures.
    if (options.reaction === 1.75 && driver.captures === 1 && capture && cue && release &&
      !driver.events.some(event => event.name === 'coverReached') && String(error).includes('Capture during real walk')) {
      expect(release.time - cue.time).toBeGreaterThanOrEqual(options.reaction - 1e-9);
      expect(release.time - cue.time).toBeLessThan(options.reaction + Math.max(...options.deltas) + 1e-9);
      expect(capture.time).toBeGreaterThan(release.time);
      expect(capture.time - release.time).toBeLessThan(2);
      expect(capture.detail).toMatchObject({ precedingFrame: { phase: 'attack' }, recoveryPending: true });
      expect(driver.events.some(event => event.name === 'movementResumed' && event.time > release.time && event.time < capture.time)).toBe(true);
      expect(driver.session).toMatchObject({ keyTaken: true, practiced: true, ratchets: release.ratchets, actor: { recoveryPending: true } });
      driver.assertSafe('late-response-recovery');
      measurements.push({ options, outcome: 'captured-after-late-response', simulatedSeconds: driver.time,
        captures: driver.captures, distanceWalked: driver.distanceWalked, events: driver.events });
      return;
    }
    measurements.push({ options, error: String(error), events: driver.events });
    throw error;
  }
});
