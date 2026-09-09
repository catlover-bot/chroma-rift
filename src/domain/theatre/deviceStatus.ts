import type { ChapterRuntime, InteractableId } from '../firstPerson/types';
import { THEATRE_PROJECTOR } from './definition';
import { evaluateLight } from './lightGate';

type TheatreView = Pick<ChapterRuntime, 'progress' | 'theatre'>;
export const THEATRE_LIGHT_COMMIT_LABEL = '灯りを固定して扉を開く';
export const THEATRE_WINDOW_LABELS = {
  left: { number: 1, label: '窓1（左）' },
  right: { number: 2, label: '窓2（右）' },
} as const;

/** Read the same optical result used by commit validation. Numbering is tied
 * to the physical receiver ID, never to the order of a generated polygon. */
export function theatreLightStatus(runtime: TheatreView) {
  const saved = runtime.progress.theatre!, live = runtime.theatre!;
  const optical = evaluateLight(live.rail);
  const windows = [...optical.windows].sort((a, b) => THEATRE_WINDOW_LABELS[a.id].number - THEATRE_WINDOW_LABELS[b.id].number)
    .map(window => ({ ...window, ...THEATRE_WINDOW_LABELS[window.id], state: window.lit ? '光' as const : '影' as const }));
  const count = windows.filter(window => window.lit).length;
  const released = !live.activeDrag && live.rail === saved.light.rail;
  const canCommit = live.mode === 'light' && !saved.light.accepted && released && optical.canLock;
  const instruction = saved.light.accepted ? '灯りは固定済み。影と窓を任意で確かめられます。' :
    !released ? '指を離して、灯りの位置を確定しよう。' :
    optical.canLock ? '両方に光が届いた。固定すると扉が開きます。' : '2つの窓から影を外そう。';
  return { optical, count, windows, released, canCommit, instruction,
    commitLabel: THEATRE_LIGHT_COMMIT_LABEL, showDragCue: !saved.light.accepted && !live.lightDragCompleted };
}

/** Presentation buckets only: the motor duration, cooldown and emitted noise
 * remain authoritative domain values. This does not claim the actor heard it. */
export function theatreProjectorStatus(runtime: TheatreView) {
  const saved = runtime.progress.theatre!, live = runtime.theatre!;
  const phase = live.projectorSeconds > THEATRE_PROJECTOR.duration - .8 ? 'starting' :
    live.projectorSeconds > 0 ? 'running' : live.projectorCooldown > 0 ? 'cooldown' : live.projectorArmed ? 'armed' : 'idle';
  const seconds = Math.ceil(phase === 'starting' || phase === 'running' ? live.projectorSeconds : phase === 'cooldown' ? live.projectorCooldown : 0);
  const available = saved.light.accepted && !saved.completed && live.mode === 'explore' && !live.activeDrag && !live.projectorArmed && live.projectorCooldown <= 0;
  const actionLabel = phase === 'starting' ? '映写機が動き始めた' : phase === 'running' ? '映写機は作動中' :
    phase === 'cooldown' ? `再使用まで約${seconds}秒` : phase === 'armed' ? '取っ手を回す' : '映写機を回す';
  const message = !saved.light.accepted ? '先に灯りを固定しよう。' : phase === 'armed' ? '取っ手を回す。操作中も周囲は動きます。' :
    phase === 'starting' ? '映写機が動き始めた。音はここから響く。' : phase === 'running' ? '映写機は作動中。周囲を確かめて移動しよう。' :
    phase === 'cooldown' ? `再使用まで約${seconds}秒` : '取っ手を回すと、この場所から音が響きます。';
  return { phase, seconds, message, actionLabel, available, key: `${phase}:${seconds}:${available}` };
}

/** Authored targets stay available as status cues after one-time operations.
 * The interaction evaluator and reducer separately reject redundant changes. */
export function theatreTargetLabel(id: InteractableId, runtime: TheatreView): string {
  const saved = runtime.progress.theatre!;
  switch (id) {
    case 'theatre-light': return saved.light.accepted ? '灯りと影を確かめる（任意）' : '灯りを動かす';
    case 'theatre-inspection': return saved.inspectionShutterOpen ? '点検窓は開放済み' : '側面の点検窓を開く';
    case 'theatre-ames-side': return '部屋の構造を調べる';
    case 'theatre-bypass': return saved.bypassOpen ? '保守通路は開通済み' : '保守通路を開く';
    case 'theatre-projector': return theatreProjectorStatus(runtime).actionLabel;
    case 'theatre-curtain': return saved.passageSealed ? '防火幕は閉鎖済み' : saved.curtainAccepted ? '防火幕を下ろしています' : '防火幕を下ろす';
    default: return '';
  }
}
