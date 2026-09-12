import type { Vec3 } from '../../firstPerson';
import { createCheckpoint } from '../../firstPerson';
import { createCampaignAreaEntry } from '../areaEntry';
import { CHAPTER_ONE } from '../definition';
import { parseChapterOneSession } from '../checkpoint';
import { openNaturalRun, playNaturalArea } from '../../../../test-support/naturalChapterRoute';
import { completeCampaignArea, createChapterOneSession, recordCampaignCheckpoint } from '../session';

declare const require: (id: string) => unknown;
const { mkdirSync, writeFileSync } = require('node:fs') as {
  mkdirSync(path: string, options: { recursive: boolean }): void;
  writeFileSync(path: string, data: string): void;
};
const { join, resolve } = require('node:path') as { join(...parts: string[]): string; resolve(path: string): string };

test.each([
  ['subdued', ['contour', 'shadow']],
  ['standard', ['shadow', 'contour']],
] as const)('one fresh %s campaign traverses five real controllers in %j order and validated handoffs', (intensity, order) => {
  let session = createChapterOneSession(`natural-route-${intensity}`, '1.0.0');
  const trace: { area: string; stage: string; runId: string; revision: number; exitPose: Vec3;
    nextArea: string; keyLocation: string; campaignCompleted: boolean }[] = [];
  for (let index = 0; index < CHAPTER_ONE.areas.length; index++) {
    const area = CHAPTER_ONE.areas[index]!;
    expect(session.currentArea).toBe(area.id);
    const run = openNaturalRun(session, intensity);
    const cleared = playNaturalArea(run, index, order, () => {
      const update = recordCampaignCheckpoint(session, area.id, createCheckpoint(run.controller.runtime));
      expect(update.accepted).toBe(true);
      if (!update.accepted) throw new Error(`Stop checkpoint rejected: ${update.reason}`);
      session = update.session;
      expect(session.keyLocation).toBe('installed');
      expect(session.finale).toMatchObject({ isolated: true, stopped: true, outdoorExited: false });
    });
    const next = CHAPTER_ONE.areas[index + 1];
    if (next) {
      const entry = createCampaignAreaEntry(next.id, session, cleared);
      const transition = completeCampaignArea(session, area.id, cleared, entry);
      expect(transition).toMatchObject({ accepted: true, kind: 'area-completed' });
      if (!transition.accepted) throw new Error(`Handoff rejected after ${area.id}: ${transition.reason}`);
      session = transition.session;
      expect(session.campaignCompleted).toBe(false);
      expect(parseChapterOneSession(session)).toBeDefined();
    } else {
      const transition = completeCampaignArea(session, area.id, cleared);
      expect(transition).toMatchObject({ accepted: true, kind: 'campaign-completed' });
      if (!transition.accepted) throw new Error(`Finale rejected: ${transition.reason}`);
      session = transition.session;
    }
    trace.push({ area: area.id, stage: area.stageId, runId: session.runId, revision: session.revision,
      exitPose: { ...cleared.pose.position }, nextArea: session.currentArea,
      keyLocation: session.keyLocation, campaignCompleted: session.campaignCompleted });
    const cold = parseChapterOneSession(JSON.parse(JSON.stringify(session)));
    expect(cold).toEqual(session);
    session = cold!;
  }
  expect(trace.map(item => item.area)).toEqual(CHAPTER_ONE.areas.map(area => area.id));
  expect(trace.every(item => item.runId === session.runId)).toBe(true);
  expect(session.completedAreas).toEqual(CHAPTER_ONE.areas.map(area => area.id));
  expect(session.finale).toEqual({ contained: true, isolated: true, stopped: true, outdoorExited: true });
  expect(parseChapterOneSession(session)).toBeDefined();
  if (process.env.CHROMA_QA_TRACE_DIR) {
    const directory = resolve(process.env.CHROMA_QA_TRACE_DIR);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `natural-route-${intensity}.json`), JSON.stringify({
      boundary: 'Jest/Node real stage controllers, collision, campaign codec and JSON cold parse; no App UI, AsyncStorage, native Canvas, audio device or video',
      intensity, order, runId: session.runId, trace, completedAreas: session.completedAreas,
      finale: session.finale, finalRevision: session.revision,
    }, null, 2) + '\n');
  }
});
