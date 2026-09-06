import type { PuzzleState } from '../domain/firstPerson';
import type { FirstPersonChapterSummary } from '../types/application';

export function chapterCompletionSummary(chapterId: string, progress: PuzzleState): FirstPersonChapterSummary {
  if (chapterId !== 'perception-gallery-v1') return { chapterId, seals: 2,
    discoveredMechanisms: ['触れない紋章', '重なる鍵', '戻ったはずの入口'] };
  const migratedCompletion = progress.gallery?.completedFromV1 === true;
  return { chapterId, chapterVersion: 2, powerCount: 2, migratedCompletion,
    discoveredMechanisms: migratedCompletion ? [] : ['影の見本', '描かれていない形', '二つの予備電源', '非常扉からの脱出'] };
}
