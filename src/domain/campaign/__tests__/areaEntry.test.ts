import { createCampaignAreaEntry } from '../areaEntry';
import { createChapterOneSession } from '../session';
import { CHAPTER_ONE } from '../definition';
import { EXIT } from '../../stages/mirror-corridor-v1/definition';
import { parseStageCheckpoint as parseMirrorCheckpoint } from '../../stages/mirror-corridor-v1/checkpoint';

test('registered entries use their own codecs and only the carried key authorizes 05', () => {
  const fresh = createChapterOneSession('entry', '0.1.0');
  for (const area of CHAPTER_ONE.areas.slice(0, 4))
    expect(createCampaignAreaEntry(area.id)?.chapterId).toBe(area.stageId);
  expect(createCampaignAreaEntry('chapter-1-area-05')).toBeUndefined();
  expect(createCampaignAreaEntry('chapter-1-area-05', fresh)).toBeUndefined();
  const mirrorEntry = createCampaignAreaEntry('chapter-1-area-04')!;
  const mirrorData = parseMirrorCheckpoint(mirrorEntry.stageData)!;
  const clearedMirror = { ...mirrorEntry, stageData: { ...mirrorData, keyTaken: true,
    practiced: true, ratchets: 3, cleared: true, pose: EXIT } };
  const leavingMirror = { ...fresh, currentArea: 'chapter-1-area-04' as const, checkpoint: mirrorEntry };
  expect(createCampaignAreaEntry('chapter-1-area-05', leavingMirror, mirrorEntry)).toBeUndefined();
  expect(createCampaignAreaEntry('chapter-1-area-05', leavingMirror, clearedMirror)?.stageData).toMatchObject({
    keyAvailable: true, keyInstalled: false, stopped: false, cleared: false,
  });
});
