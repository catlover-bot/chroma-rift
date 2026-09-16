import type { StageTargetPresentation } from '../../stageKit/presentation';
import { actorFullyContained, doorSweepClear, type TargetId } from './definition';
import type { StageCommand, StageSession } from './session';

export type DepartureActionReason = 'ready' | 'prerequisiteMissing' | 'coolingDown' | 'actorOutside' | 'sweepOccupied' | 'unsafeSide' | 'completed' | 'operating';
export type DepartureAction = StageTargetPresentation & { command: StageCommand['type']; reason: DepartureActionReason };
const commands: Record<TargetId, StageCommand['type']> = {
  'departure-key': 'install-key', 'departure-procedure': 'read-procedure', 'departure-bell': 'ring-bell',
  'departure-door': 'close-door', 'departure-reopen': 'reopen-door', 'departure-stop': 'stop-control',
  'departure-staff-door': 'open-staff-door', 'departure-outdoor': 'outdoor-exit',
};

export function selectDeparturePresentation(session: StageSession) {
  const contained = actorFullyContained(session.actor.motion.position);
  const clear = doorSweepClear(session.actor.motion.position);
  const objective = session.cleared ? '屋外へ退館した。' : session.staffDoorOpened ? '職員出口から屋外へ歩く。' :
    session.stopped ? '停止を確認し、職員出口を開く。' : session.isolated ? '隔離を確認し、閉館制御を停止する。' :
    !session.keyInstalled ? '隔離キーを制御盤へ差す。' : !session.procedureRead ? '収容手順を読む。' :
    session.doorMode === 'closing' ? '隔離扉が閉じるのを見届ける。' : session.doorMode === 'opening' ? '隔離扉が開くのを待つ。' :
    contained && clear ? '全身の収容を確認。隔離扉を閉じる。' : '区画内の受鈴器へ巡回体を誘導する。';
  const text = session.cleared ? '退館は記録済み。危険は戻らない。' : session.staffDoorOpened ? '開いた職員出口の先が屋外。自分で歩いて出る。' :
    session.stopped ? '巡回体は停止した。職員出口の押し棒へ。' : session.isolated ? '隔離戸の向こうに収容済み。停止レバーを下ろす。' :
    !session.keyInstalled ? '横顔の余白から取った隔離キーを、同じ形の差込口へ。' : !session.procedureRead ? '図のある手順板を読み、受鈴器と隔離戸を確かめる。' :
    session.doorMode !== 'idle' ? '扉の動きが終わるまで、操作ベイで見届ける。' : contained && clear ? '全身が床の収容境界内に入った。安全側から隔離する。' :
    '呼び鈴は区画内の受鈴器につながる。見つかっていたら、棚で視線を切ってから鳴らす。';
  return { objective, hint: { text }, feedbackRevision: [session.keyInstalled, session.procedureRead, session.doorMode,
    session.isolated, session.stopped, session.staffDoorOpened, session.cleared, contained, clear].join(':') };
}

/** The command reducer and HUD use this same prerequisite/sweep decision. */
export function selectDepartureAction(session: StageSession, targetId: TargetId): DepartureAction {
  const result = (state: StageTargetPresentation['state'], label: string, message: string, reason: DepartureActionReason = state === 'ready' ? 'ready' : state === 'completed' ? 'completed' : state === 'operating' ? 'operating' : 'prerequisiteMissing'): DepartureAction =>
    ({ state, label, message, reason, command: commands[targetId] });
  if (session.cleared) return result('completed', '退館済み', '屋外への退館は記録済み。');
  if (session.staffDoorOpened && targetId !== 'departure-outdoor') return result('completed', '職員出口は開放済み', '職員出口は開いている。屋外へ歩く。');
  switch (targetId) {
    case 'departure-key':
      return session.keyInstalled ? result('completed', '隔離キーは接続済み', selectDeparturePresentation(session).hint.text) :
        session.keyAvailable ? result('ready', '隔離キーを差す', '余白から取ったキーを、制御盤の差込口へ。') : result('locked', '隔離キーが必要', '鏡の回廊で隔離キーを取る。');
    case 'departure-procedure':
      return session.procedureRead ? result('completed', '手順は確認済み', selectDeparturePresentation(session).hint.text) :
        session.keyInstalled ? result('ready', '収容手順を読む', '受鈴器への誘導、隔離、停止の順を確かめる。') : result('locked', '手順板：キーを接続する', '先に隔離キーを差す。');
    case 'departure-bell':
      if (session.isolated || session.stopped) return result('completed', '誘導は完了', selectDeparturePresentation(session).hint.text);
      if (!session.procedureRead) return result('locked', '呼び鈴：手順を確認する', '先に収容手順を読む。');
      if (session.doorMode !== 'idle' || session.doorProgress > 0) return result('operating', '隔離扉を確認する', '隔離扉が開いてから呼び鈴を使う。');
      return session.bellCooldown > 0 ? result('locked', '受鈴器は鳴動中', '呼び鈴の回路が戻るのを待つ。', 'coolingDown') : result('ready', '収容区画の呼び鈴を鳴らす', '区画内の受鈴器から音が出る。');
    case 'departure-door':
      if (session.isolated || session.stopped) return result('completed', '隔離済み', selectDeparturePresentation(session).hint.text);
      if (!session.procedureRead) return result('locked', '隔離レバー：手順を確認する', '先に収容手順を読む。');
      if (session.doorMode !== 'idle' || session.doorProgress > 0) return result('operating', '隔離扉が動いている', '扉の動きが終わるまで待つ。');
      if (session.pose.position.x > -2.55 || session.pose.position.z < 8.2 || session.pose.position.z > 13.8)
        return result('locked', '安全側から隔離する', '制御ベイの安全側へ戻る。', 'unsafeSide');
      if (!doorSweepClear(session.actor.motion.position)) return result('locked', '隔離扉の敷居を空ける', '巡回体が扉の可動範囲にいる。全身が奥へ入るまで待つ。', 'sweepOccupied');
      return actorFullyContained(session.actor.motion.position) ? result('ready', '隔離扉を閉じる', '全身の収容を確認。隔離扉を閉じられる。') :
        result('locked', '全身の収容を待つ', '巡回体の全身が床の収容境界に入るまで閉じられない。', 'actorOutside');
    case 'departure-reopen':
      if (session.stopped) return result('completed', '隔離を保持する', '巡回体は停止済み。職員出口へ進む。');
      if (session.doorMode === 'opening') return result('operating', '隔離扉を開いている', '扉が開き切るまで待つ。');
      return session.doorProgress > 0 ? result('ready', '隔離扉を開け直す', '隔離を解除し、扉を開け直す。') : result('completed', '隔離扉は開放済み', '呼び鈴で区画内へ誘導できる。');
    case 'departure-stop':
      return session.stopped ? result('completed', '閉館制御は停止済み', '巡回体は停止した。職員出口へ進む。') :
        session.isolated && session.doorProgress === 1 && actorFullyContained(session.actor.motion.position) ? result('ready', '閉館制御を停止する', '隔離を保持したまま、主制御の電源を断つ。') :
          result('locked', '停止盤：収容と隔離が先', '先に巡回体の収容と隔離を行う。');
    case 'departure-staff-door':
      return session.stopped ? result('ready', '職員出口を開ける', '巡回体の停止を確認。押し棒で職員出口を開く。') : result('locked', '職員出口：停止を確認する', '先に隔離し、閉館制御を停止する。');
    case 'departure-outdoor':
      if (!session.stopped || !session.staffDoorOpened) return result('locked', '職員出口を開ける', '閉館制御を停止し、職員出口を開ける。');
      return session.pose.position.z >= 22.35 ? result('ready', '屋外へ出る', '施設の外へ退館する。') : result('locked', '屋外へ歩く', '開いた職員出口を通り、外の敷居まで歩く。');
  }
}
