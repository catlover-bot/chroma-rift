import type { PuzzleState } from '../domain/firstPerson';
import type { FirstPersonChapterSummary } from '../types/application';

export function chapterCompletionSummary(chapterId: string, progress: PuzzleState): FirstPersonChapterSummary {
  if (chapterId !== 'perception-gallery-v1') return { chapterId, seals: 2,
    discoveredMechanisms: ['触れない紋章', '重なる鍵', '戻ったはずの入口'] };
  const migratedCompletion = progress.gallery?.completedFromV1 === true || progress.gallery?.completedFromV2 === true;
  return { chapterId, chapterVersion: 3, powerCount: 2, migratedCompletion,
    discoveredMechanisms: migratedCompletion ? [] : ['影の見本', '描かれていない形', ...(progress.gallery?.discoveries.wiring && !progress.gallery.wiring.compatibleBypass ? ['隠れた配線'] : []), '扉を閉めて脱出'] };
}
