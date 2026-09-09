import { cameraMatchesPose, evaluateKeyAlignment, projectWithCamera } from './alignment';
import { clamp, forwardVector, rayBoxDistance, raySphereDistance, segmentOccluded } from './geometry';
import type { CameraMatrices, InteractableDefinition, PlayerPose, PuzzleState, Vec3, WorldGeometry } from './types';

/** Product tuning in radians. Only authored, visible guide/device/door fixtures
 * gain this central acquisition area. The overlapping key keeps its exact ray. */
export const INTERACTION_CONE_DEGREES = 6;
export const INTERACTION_CONE_RADIANS = INTERACTION_CONE_DEGREES * Math.PI / 180;

export type InteractionEvaluation = {
  kind: 'ready' | 'locked' | 'approach' | 'aim';
  target: InteractableDefinition;
  actionLabel: string;
  reason?: string;
} | { kind: 'none'; target?: undefined; actionLabel?: undefined; reason?: undefined };

function actionLabel(target: InteractableDefinition, progress?: PuzzleState): string {
  switch (target.id) {
    case 'theatre-light':
    case 'theatre-inspection':
    case 'theatre-ames-side':
    case 'theatre-bypass':
    case 'theatre-projector':
    case 'theatre-curtain': return target.label;
    case 'vault-length': return '留め金を調整';
    case 'vault-rod': return '針を調整';
    case 'vault-cafe': return '目地を比べる';
    case 'vault-partition': return '仕切りを閉める';
    case 'vault-exit': return '搬出口を封鎖';
    case 'gallery-light': return '非常灯を点ける';
    case 'gallery-exit-panel': return progress?.gallery?.powerTaken.shadow && progress.gallery.powerTaken.contour ? '電源を接続' : '非常口を確認';
    case 'chromatic-exhibit': return '色をほどく';
    case 'mask-exhibit': return '横から確かめる';
    case 'mask-window': return '側面の窓を動かす';
    case 'hybrid-exhibit': return '掲示を確かめる';
    case 'wiring-panel': return '配線を操作';
    case 'shadow-power': case 'contour-power': return '電源を取る';
    case 'shadow-panel': case 'contour-panel': return '装置を操作';
    case 'emblem-panel': return '紋章を調べる';
    case 'emblem-circle': return '丸の印を押す';
    case 'emblem-diamond': return 'ひし形の印を押す';
    case 'emblem-square': return '四角の印を押す';
    case 'guide': return 'しるべを調べる';
    case 'floor-device': return '装置を動かす';
    case 'key': return '鍵を重ねる';
    case 'exit': return progress?.gallery ? '扉を閉める' : '扉を開く';
  }
}

function lockedReason(target: InteractableDefinition, progress: PuzzleState | undefined, aligned: boolean): string | undefined {
  if (!progress) return undefined;
  switch (target.id) {
    case 'theatre-light': return progress.theatre ? undefined : 'この装置はありません。';
    case 'theatre-inspection': return progress.theatre?.inspectionShutterOpen ? '点検窓は開放済み。側面の展示を調べられます。' : progress.theatre?.light.accepted ? undefined : '先に灯りを固定しよう。';
    case 'theatre-ames-side': return progress.theatre?.inspectionShutterOpen ? undefined : '側面の点検窓を開こう。';
    case 'theatre-bypass': return progress.theatre?.bypassOpen ? '保守通路は開通済み。' : progress.theatre?.inspectionShutterOpen ? undefined : '側面の点検窓を開こう。';
    case 'theatre-projector': return progress.theatre?.light.accepted ? undefined : '先に灯りを固定しよう。';
    case 'theatre-curtain': return progress.theatre?.curtainAccepted ? progress.theatre.passageSealed ? '防火幕は閉鎖済み。奥のサービス出口へ。' : '防火幕を下ろしています。' : progress.theatre?.light.accepted ? undefined : '先に灯りを固定しよう。';
    case 'vault-length': return progress.vault ? undefined : 'この装置はありません。';
    case 'vault-rod': return progress.vault?.length.solved ? undefined : '先に留め金を固定しよう。';
    case 'vault-cafe': return undefined;
    case 'vault-partition': return progress.vault?.rod.solved ? undefined : '制動ベイで針をロックしよう。';
    case 'vault-exit': return progress.vault?.finalDoorClosed ? '搬出口を封鎖しました。' : progress.vault?.rod.solved ? undefined : '制動ベイで針をロックしよう。';
    case 'gallery-light': return progress.gallery?.emergencyLit ? '非常灯は点いています。' : undefined;
    case 'gallery-exit-panel': return progress.gallery?.powerConnected ? '電源を接続しました。サービス通路へ。' : undefined;
    case 'chromatic-exhibit': case 'mask-exhibit': case 'mask-window': case 'hybrid-exhibit': return undefined;
    case 'wiring-panel': return progress.gallery?.powerConnected ? undefined : '出口の盤へ予備電源を二つ接続しよう。';
    case 'shadow-power': return progress.gallery?.shadow.solved && !progress.gallery.powerTaken.shadow ? undefined : '引き出しの電源は取得済みです。';
    case 'contour-power': return progress.gallery?.contour.solved && !progress.gallery.powerTaken.contour ? undefined : '引き出しの電源は取得済みです。';
    case 'shadow-panel':
    case 'contour-panel': return progress.gallery ? undefined : 'この装置はありません。';
    case 'emblem-panel': return progress.sealA ? '紋章の封印は解けています。奥の回廊へ進もう。' : undefined;
    case 'emblem-circle':
    case 'emblem-diamond':
    case 'emblem-square':
      if (progress.sealA) return '紋章の封印は解けています。奥の回廊へ進もう。';
      return progress.emblem?.phase === 'observing' ? undefined : 'まず壁の紋章を調べよう。';
    case 'guide': return progress.guideExamined ? 'しるべは調べました。' : undefined;
    case 'floor-device': return 'この装置は現在の謎では使用しません。';
    case 'key':
      if (progress.sealB) return '鍵は重なりました。入口へ戻ろう。';
      if (!progress.sealA) return '先に紋章の封印を解こう。';
      if (progress.gallery && (!progress.gallery.shadow.solved || !progress.gallery.contour.solved)) return '二つの翼の封印を解こう。';
      return aligned ? undefined : '観察の輪から、欠けた鍵の形を重ねよう。';
    case 'exit':
      if (progress.gallery) return progress.gallery.finalDoorClosed ? '扉は閉まりました。' : progress.gallery.wiring.solved ? undefined : '保守ベイで隠れた配線をつなごう。';
      if (progress.exitDoorOpen) return '扉は開いています。外へ歩こう。';
      return progress.variant === 'exit' && progress.sealA && progress.sealB ? undefined : '二つの封印を解くと開きます。';
  }
}

type InteractionCandidate = {
  target: InteractableDefinition; angle: number; distance: number;
  exact: boolean; acquired: boolean; reachable: boolean; visible: boolean;
};
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const difference = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** Rectangle acquisition tests the actual visible surface point, never its
 * center or a bounding sphere. A visible edge remains usable when the middle
 * of a large plate falls outside the camera or behind another opaque object. */
function rectangleCandidate(world: WorldGeometry, pose: PlayerPose, ray: Vec3, target: InteractableDefinition, matrices?: CameraMatrices): InteractionCandidate | undefined {
  const rectangle = target.rectangle!;
  const { width, height, normal, right } = rectangle;
  if (!normal || !right) return undefined;
  const normalLength = Math.hypot(normal.x, normal.y, normal.z);
  const rightLength = Math.hypot(right.x, right.y, right.z);
  if (![target.center.x, target.center.y, target.center.z, width, height, normalLength, rightLength, target.maxDistance].every(Number.isFinite) ||
      width <= 0 || height <= 0 || target.maxDistance <= 0 || Math.abs(normalLength - 1) > 0.0001 || Math.abs(rightLength - 1) > 0.0001 || Math.abs(dot(normal, right)) > 0.0001) return undefined;
  const up = { x: normal.y * right.z - normal.z * right.y, y: normal.z * right.x - normal.x * right.z, z: normal.x * right.y - normal.y * right.x };
  const fromCenter = difference(pose.position, target.center);
  const frontDistance = dot(fromCenter, normal);
  if (frontDistance <= 0.00001) return undefined;
  const pointAt = (horizontal: number, vertical: number): Vec3 => ({
    x: target.center.x + right.x * horizontal + up.x * vertical,
    y: target.center.y + right.y * horizontal + up.y * vertical,
    z: target.center.z + right.z * horizontal + up.z * vertical,
  });
  const visible = (point: Vec3): boolean => (!matrices || !!projectWithCamera(point, matrices)) && !segmentOccluded(pose.position, point, world, `${target.id}-body`);
  const towardsPlane = dot(ray, normal);
  if (towardsPlane < -0.00001) {
    const distance = -frontDistance / towardsPlane;
    const point = { x: pose.position.x + ray.x * distance, y: pose.position.y + ray.y * distance, z: pose.position.z + ray.z * distance };
    const local = difference(point, target.center);
    if (Number.isFinite(distance) && Math.abs(dot(local, right)) <= width / 2 + 0.00000001 && Math.abs(dot(local, up)) <= height / 2 + 0.00000001 && visible(point)) {
      return { target, angle: 0, distance, exact: true, acquired: true, reachable: distance <= target.maxDistance, visible: !!matrices };
    }
  }
  if (!matrices) return undefined;
  // Quiet approach/aim cues may use visible authored surface samples. Every
  // activation above still requires its own exact, unoccluded plate hit.
  const samples = [pointAt(clamp(dot(fromCenter, right), -width / 2, width / 2), clamp(dot(fromCenter, up), -height / 2, height / 2)),
    ...[-0.5, 0, 0.5].flatMap((x) => [-0.5, 0, 0.5].map((y) => pointAt(x * width, y * height)))];
  const candidate = samples.filter(visible).map((point) => {
    const offset = difference(point, pose.position);
    const distance = Math.hypot(offset.x, offset.y, offset.z);
    return { point, distance, angle: Math.acos(clamp(dot(offset, ray) / distance, -1, 1)) };
  }).sort((a, b) => a.distance - b.distance || a.angle - b.angle)[0];
  return candidate ? { target, angle: candidate.angle, distance: candidate.distance, exact: false, acquired: false, reachable: candidate.distance <= target.maxDistance, visible: true } : undefined;
}

/** Shared HUD and action eligibility. A fresh press runs this again; labels
 * never authorize an action by themselves. Projection is required for broad
 * visibility cues, while central ray/cone checks use the current world pose. */
export function evaluateInteraction(world: WorldGeometry, pose: PlayerPose, progress?: PuzzleState, matrices?: CameraMatrices, previouslyAligned = false): InteractionEvaluation {
  if (![pose.position.x, pose.position.y, pose.position.z, pose.yaw, pose.pitch].every(Number.isFinite)) return { kind: 'none' };
  const ray = forwardVector(pose);
  const matchingCamera = !!matrices && cameraMatchesPose(pose, matrices);
  if (matrices && !matchingCamera) return { kind: 'none' };
  const candidates = world.interactables.flatMap((target): InteractionCandidate[] => {
    if (target.rectangle && target.id !== 'key') {
      const candidate = rectangleCandidate(world, pose, ray, target, matchingCamera ? matrices : undefined);
      return candidate ? [candidate] : [];
    }
    const difference = { x: target.center.x - pose.position.x, y: target.center.y - pose.position.y, z: target.center.z - pose.position.z };
    const distance = Math.hypot(difference.x, difference.y, difference.z);
    if (![distance, target.radius, target.maxDistance].every(Number.isFinite) || distance <= 0 || target.radius <= 0 || target.maxDistance <= 0) return [];
    const cosine = (difference.x * ray.x + difference.y * ray.y + difference.z * ray.z) / distance;
    if (cosine <= 0) return [];
    const angle = Math.acos(clamp(cosine, -1, 1));
    if (matchingCamera && !projectWithCamera(target.center, matrices!)) return [];
    const exactDistance = raySphereDistance(pose.position, ray, target.center, target.radius);
    // Never acquire an unseen fixture by clipping an enlarged hotspot around a
    // wall edge. Exact hits also retain their original opaque-ray check.
    if (segmentOccluded(pose.position, target.center, world, `${target.id}-body`)) return [];
    const exact = exactDistance !== undefined && !world.solids.some((solid) => {
      if (!solid.opaque || solid.id === `${target.id}-body`) return false;
      const obstacle = rayBoxDistance(pose.position, ray, solid);
      return obstacle !== undefined && obstacle < exactDistance - 0.02;
    });
    const central = target.id !== 'key' && angle <= INTERACTION_CONE_RADIANS;
    const acquired = exact || central;
    if (!acquired && (!matchingCamera || !projectWithCamera(target.center, matrices!))) return [];
    // Preserve near-surface reach for exact hits. Cone acquisition measures the
    // same authored sphere along its center ray, never an expanded hidden one.
    const reachDistance = exact ? exactDistance! : Math.max(0, distance - target.radius);
    return [{ target, angle, distance, exact, acquired, reachable: reachDistance <= target.maxDistance, visible: matchingCamera }];
  });
  const acquired = candidates.filter((candidate) => candidate.acquired && candidate.reachable).sort((a, b) =>
    Number(b.exact) - Number(a.exact) || (a.exact && b.exact ? a.distance - b.distance : a.angle - b.angle || a.distance - b.distance) || a.target.id.localeCompare(b.target.id));
  const selected = acquired[0];
  if (selected) {
    const aligned = selected.target.id === 'key' && !!matrices && evaluateKeyAlignment(pose, world, matrices, previouslyAligned).aligned;
    const reason = lockedReason(selected.target, progress, aligned);
    return { kind: reason ? 'locked' : 'ready', target: selected.target, actionLabel: actionLabel(selected.target, progress), ...(reason ? { reason } : {}) };
  }
  // These cues explain a visible object; they cannot become an action target.
  // Require the real camera for distant cues as in the renderer readiness path.
  const visible = matchingCamera ? candidates.filter((candidate) => candidate.visible).sort((a, b) => (progress?.emblem?.phase !== 'observing' ? Number(b.target.id === 'emblem-panel') - Number(a.target.id === 'emblem-panel') : 0) || a.distance - b.distance || a.angle - b.angle || a.target.id.localeCompare(b.target.id))[0] : undefined;
  return visible ? { kind: visible.reachable ? 'aim' : 'approach', target: visible.target, actionLabel: actionLabel(visible.target, progress) } : { kind: 'none' };
}
