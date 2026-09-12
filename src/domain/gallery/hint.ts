import type { ChapterRuntime, Vec3 } from '../firstPerson/types';
import { GALLERY_SHADOW_FIXTURE, GALLERY_CONTOUR_FIXTURE, GALLERY_EXIT_PANEL_FIXTURE, GALLERY_FINAL_DOOR_FIXTURE } from './definition';
import { galleryDeviceStatus, galleryPowerCount } from './selectors';

export function galleryHint(runtime: ChapterRuntime): { text: string; target?: Vec3 } {
  const g = runtime.progress.gallery;
  if (!g) return { text: '' };
  const stage = Math.max(1, runtime.progress.hintStage) - 1;
  if (g.powerConnected) return { text: ['サービス通路を進んで非常扉へ。', '曲がり角の先には、棚の陰に退ける場所がある。', '安全を確かめて非常扉を開き、その先へ歩こう。'][stage]!, target: GALLERY_FINAL_DOOR_FIXTURE.center };
  if (galleryPowerCount(g) === 2) return { text: '出口の盤に予備電源を二つ接続しよう。', target: GALLERY_EXIT_PANEL_FIXTURE.center };
  const nearestC = Math.hypot(runtime.pose.position.x - GALLERY_CONTOUR_FIXTURE.center.x, runtime.pose.position.z - GALLERY_CONTOUR_FIXTURE.center.z) < Math.hypot(runtime.pose.position.x - GALLERY_SHADOW_FIXTURE.center.x, runtime.pose.position.z - GALLERY_SHADOW_FIXTURE.center.z);
  const puzzle = !g.powerTaken.contour && (g.powerTaken.shadow || runtime.gallery?.mode === 'contour' || nearestC) ? 'contour' : 'shadow';
  const device = galleryDeviceStatus(runtime, puzzle)!;
  if (device.canTakePower) return { text: '開いた引き出しから「電源を取る」を押そう。', target: puzzle === 'shadow' ? GALLERY_SHADOW_FIXTURE.center : GALLERY_CONTOUR_FIXTURE.center };
  return puzzle === 'shadow' ? { text: ['左の部屋で、四角い見本を下の枠へ運ぼう。', '別々の二枚を、同じ中立の背景に並べよう。', '同じ灰色か確かめて「比べる」を押そう。背景をそろえる比較は任意です。'][stage]!, target: GALLERY_SHADOW_FIXTURE.center } :
    { text: ['右の部屋で、黒い円盤のふちをなぞって回そう。', '三つの切れ目を、中央へ向けよう。', '3/3になったら指を離し「引き出しを開く」を押そう。輪郭ガイドは任意です。'][stage]!, target: GALLERY_CONTOUR_FIXTURE.center };
}
