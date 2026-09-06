import type { ChapterRuntime } from '../firstPerson/types';
import { angularDifference, CONTOUR_TOLERANCE, createContourSpec } from './contour';
import { SAMPLE_IDS, validShadowAssignments } from './shadow';
import type { GalleryProgress, GalleryPuzzle, ShadowCheckpoint } from './types';

export function galleryPowerCount(progress: GalleryProgress): 0 | 1 | 2 { return (Number(progress.powerTaken.shadow) + Number(progress.powerTaken.contour)) as 0 | 1 | 2; }
export function shadowPlacedCount(shadow: ShadowCheckpoint): 0 | 1 | 2 {
  if (!validShadowAssignments(shadow.assignments)) return 0;
  return SAMPLE_IDS.filter(id => shadow.assignments[id] === 'socket-left' || shadow.assignments[id] === 'socket-right').length as 0 | 1 | 2;
}
export function contourAlignedCount(seed: number, angles: readonly number[]): 0 | 1 | 2 | 3 {
  if (angles.length !== 3 || !angles.every(Number.isFinite)) return 0;
  return createContourSpec(seed).discs.filter(disc => angularDifference(angles[disc.id]!, disc.targetAngle) <= CONTOUR_TOLERANCE + 1e-12).length as 0 | 1 | 2 | 3;
}
export function galleryDeviceStatus(runtime: ChapterRuntime, selected?: GalleryPuzzle) {
  const live = runtime.gallery, saved = runtime.progress.gallery;
  const puzzle = selected ?? (live?.mode === 'explore' ? undefined : live?.mode);
  if (!live || !saved || !puzzle) return undefined;
  const solved = saved[puzzle].solved, taken = saved.powerTaken[puzzle];
  const count = puzzle === 'shadow' ? shadowPlacedCount(saved.shadow) : contourAlignedCount(saved.contour.seed, live.contourAngles);
  const sameAngles = live.contourAngles.every((angle, id) => angularDifference(angle, saved.contour.angles[id]!) < 1e-10);
  const ready = puzzle === 'shadow' ? count === 2 : count === 3 && sameAngles;
  const incorrect = live.lastDeviceResult?.puzzle === puzzle && !live.lastDeviceResult.correct;
  const instruction = taken ? '予備電源を取りました。出口の盤へ戻ろう。' : solved ? '下の引き出しが開いた。電源を取ろう。' :
    puzzle === 'shadow' ? incorrect ? '明るさが違う。どちらかを入れ替えよう。' : count === 0 ? '見本を1枚、下の枠へドラッグ' : count === 1 ? 'もう1枚を、隣の枠へ' : '同じ灰色か確かめて「比べる」' :
      live.activeDrag ? '指を離して、円盤の向きを確定' : count === 3 ? '3枚が中心を向いた。「引き出しを開く」' : count === 0 ? '黒い円盤のふちをドラッグして回す' : 'あと' + (3 - count) + '枚の向きを合わせる';
  return { puzzle, count, total: puzzle === 'shadow' ? 2 : 3, solved, powerTaken: taken,
    objective: puzzle === 'shadow' ? '同じ灰色の2枚を、下の四角い枠へ置く' : '3枚を回して、切れ目を中央へ向ける',
    instruction, commitEnabled: !solved && !live.activeDrag && ready,
    commitLabel: puzzle === 'shadow' ? '比べる' : '引き出しを開く', canTakePower: solved && !taken && !live.activeDrag };
}
export function galleryObjective(runtime: ChapterRuntime): string {
  const p = runtime.progress, g = p.gallery!;
  if (p.cleared) return g.completedFromV1 ? '以前の展示室のクリア記録を保持しています。' : '閉館後の展示室から脱出した。';
  const device = galleryDeviceStatus(runtime);
  if (device) return device.objective;
  if (p.exitDoorOpen) return '開いた非常扉の外へ歩く';
  if (g.powerConnected) return 'サービス通路を抜け、非常扉へ';
  const count = galleryPowerCount(g);
  if (count === 2) return '出口の盤へ、予備電源を2つ接続する';
  if (count === 1 || g.exitInspected) return '予備電源を探す ' + count + '/2';
  return '出口を探す';
}
