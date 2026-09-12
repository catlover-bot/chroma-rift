/** Product areas are stable story positions; their stage IDs and save keys are separate. */
export const CHAPTER_ONE = {
  id: 'chapter-1',
  title: '最後の退館者',
  contentVersion: 1,
  areas: [
    { id: 'chapter-1-area-01', number: '01', title: '閉館後の展示室', stageId: 'perception-gallery-v1', entry: '閉館点検口', onward: '収蔵庫の職員通路', routable: true },
    { id: 'chapter-1-area-02', number: '02', title: '測れない収蔵庫', stageId: 'uncanny-vault-v1', entry: '収蔵庫の職員通路', onward: '映写室の管理経路', routable: true },
    { id: 'chapter-1-area-03', number: '03', title: '影の映写室', stageId: 'shadow-theatre-v1', entry: '映写室の管理経路', onward: '隔離区画の点検回廊', routable: true },
    { id: 'chapter-1-area-04', number: '04', title: '鏡越しの回廊', stageId: 'mirror-corridor-v1', entry: '隔離区画の点検回廊', onward: '退館制御室の前室', routable: true },
    { id: 'chapter-1-area-05', number: '05', title: '退館制御室', stageId: 'departure-control-v1', entry: '退館制御室の前室', onward: '職員出口と屋外', routable: true },
  ],
} as const;

/** Metadata only: chapter two has no stage, command, save, or purchase route. */
export const CHAPTER_TWO = {
  id: 'chapter-2', availability: 'planned',
  notice: '今後のアップデートで追加予定',
  unavailable: '現在のバージョンではプレイできません。',
} as const;

export type CampaignArea = typeof CHAPTER_ONE.areas[number];
export type CampaignAreaId = CampaignArea['id'];
export type CampaignStageId = CampaignArea['stageId'];
export const CAMPAIGN_AREA_IDS: readonly CampaignAreaId[] = CHAPTER_ONE.areas.map(area => area.id);
export function campaignArea(id: unknown): CampaignArea | undefined {
  return typeof id === 'string' ? CHAPTER_ONE.areas.find(area => area.id === id) : undefined;
}
export function nextCampaignArea(id: CampaignAreaId): CampaignArea | undefined {
  const index = CHAPTER_ONE.areas.findIndex(area => area.id === id);
  return index < 0 ? undefined : CHAPTER_ONE.areas[index + 1];
}
