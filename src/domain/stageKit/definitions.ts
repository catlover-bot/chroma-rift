/** One static content catalog. Storage keys are stable even when contentVersion changes. */
const devContent = typeof __DEV__ === 'undefined' || __DEV__;
export const STAGE_DEFINITIONS = [
  { id: 'perception-gallery-v1', number: '01', title: '閉館後の展示室', teaser: '誰もいない展示室で、非常灯と職員通路を探す。', contentVersion: 3, saveKey: 'chroma-rift.perception-gallery.v3', discoveries: ['chromatic', 'shadow', 'contour', 'mask', 'wiring', 'hybrid', 'shepard'], targets: ['wiring-panel','mask-exhibit','mask-window','hybrid-exhibit','gallery-light','gallery-exit-panel','chromatic-exhibit','shadow-power','contour-power','shadow-panel','contour-panel','exit'], renderKind: 'gallery', binding: 'compat', playerVisible: true },
  { id: 'uncanny-vault-v1', number: '02', title: '測れない収蔵庫', teaser: '長さと鉛直を確かめ、棚の陰を抜ける。', contentVersion: 1, saveKey: 'chroma-rift.uncanny-vault.v1', discoveries: ['length', 'rod', 'cafe'], targets: ['vault-length','vault-rod','vault-cafe','vault-partition','vault-exit'], renderKind: 'vault', binding: 'module', playerVisible: true },
  { id: 'shadow-theatre-v1', number: '03', title: '影の映写室', teaser: '灯りで影を動かし、静かな映写室を抜ける。', contentVersion: 1, saveKey: 'chroma-rift.shadow-theatre.v1', discoveries: ['shadow', 'depth'], targets: ['theatre-light','theatre-inspection','theatre-ames-side','theatre-bypass','theatre-projector','theatre-curtain','theatre-bell-a','theatre-bell-b','theatre-shutter-south','theatre-shutter-north'], renderKind: 'theatre', binding: 'module', playerVisible: true },
  { id: 'returnless-entrance', title: '帰り道のない入口', teaser: 'ふたつの仕掛けをたどる、はじまりの章。', contentVersion: 1, saveKey: 'chroma-rift.first-person.chapter.v1', discoveries: [], targets: ['guide','floor-device','key','exit','emblem-panel','emblem-circle','emblem-diamond','emblem-square'], renderKind: 'legacy', binding: 'compat', playerVisible: true },
  ...(devContent ? [{ id: 'stage-kit-probe', title: 'Stage Kit 確認室', teaser: '開発用の接続確認室。', contentVersion: 1, saveKey: 'chroma-rift.dev.stage-kit-probe.v1', discoveries: [], targets: ['stage-kit-probe-device','stage-kit-probe-door','stage-kit-probe-exit'], renderKind: 'simple', binding: 'module', playerVisible: false }] as const : []),
  { id: 'mirror-corridor-v1', number: '04', title: '鏡越しの回廊', teaser: '隔離キーと格子の向こうに制御室がある。', contentVersion: 1, saveKey: 'chroma-rift.mirror-corridor.v1', discoveries: ['figure', 'mirror', 'ratchet'], targets: ['mirror-corridor-figure','mirror-corridor-key','mirror-corridor-practice','mirror-corridor-winch','mirror-corridor-exit'], renderKind: 'simple', binding: 'module', playerVisible: false },
  { id: 'departure-control-v1', number: '05', title: '退館制御室', teaser: '巡回体を収容し、閉館処理を終える。', contentVersion: 1, saveKey: 'chroma-rift.departure-control.v1', discoveries: ['containment', 'attendance'], targets: ['departure-key','departure-procedure','departure-bell','departure-door','departure-reopen','departure-stop','departure-staff-door','departure-outdoor'], renderKind: 'simple', binding: 'module', playerVisible: false },
] as const;
export type StageDefinition = typeof STAGE_DEFINITIONS[number];
export type StageId = StageDefinition['id'];
export type PlayableStageDefinition = Extract<StageDefinition,{playerVisible:true}>;
export type PlayableStageId = PlayableStageDefinition['id'];
export type StageTargetId = StageDefinition['targets'][number];
export function stageDefinition(id: unknown): StageDefinition | undefined {
  return typeof id === 'string' ? STAGE_DEFINITIONS.find(stage => stage.id === id) : undefined;
}
