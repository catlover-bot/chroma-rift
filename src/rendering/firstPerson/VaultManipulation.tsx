import { useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type NativeTouchEvent } from 'react-native';
import { LENGTH_SPEC } from '../../domain/vault/specs';
import type { VaultAction, VaultDevice } from '../../domain/vault/types';
import type { RuntimeController } from './runtimeController';
import { vaultAction, vaultDeviceScreenBounds, vaultPointer } from './vaultController';
import { SceneActionButton } from './SceneActionButton';
import { observeReleaseBarrier, requireAllPointersReleased, targetChangedTouches } from './touchInput';

type Common = { controller: RuntimeController; enabled: boolean; onChange: () => void };
function lifetime(enabled: boolean, key = '') {
  let active = enabled;
  return { key, current: () => active, activate: () => { active = enabled; }, dispose: () => { active = false; } };
}
function touchLifetime(controller: RuntimeController, enabled: boolean, mode: string) {
  const owner = lifetime(enabled);
  return { ...owner, dispose: () => {
    owner.dispose();
    if (controller.runtime.vault?.mode !== mode || controller.retired) return;
    const drag = controller.runtime.vault.activeDrag;
    if (drag) { requireAllPointersReleased(controller.input); if (!controller.input.releaseBarrier.includes(drag.pointerId)) controller.input.releaseBarrier.push(drag.pointerId); }
    vaultAction(controller, { type: 'cancel' });
  } };
}
function retainPausePointers(controller: RuntimeController, pointers: number[]) {
  controller.input.releaseBarrier = [...new Set([...controller.input.releaseBarrier, ...pointers.filter(Number.isSafeInteger)])];
}
/** Only the projected board owns a geometry hit view. Native local coordinates
 * are translated back to the one gameplay Canvas before ray/plane hit testing. */
export function VaultTouchLayer({ controller, enabled, onChange, width, height, onPause }: Common & { width: number; height: number; onPause: () => void }) {
  const mode = controller.runtime.vault?.mode ?? 'explore';
  const owner = useMemo(() => touchLifetime(controller, enabled, mode), [controller, enabled, mode]);
  useLayoutEffect(() => { owner.activate(); return () => owner.dispose(); }, [owner]);
  const bounds = vaultDeviceScreenBounds(controller);
  const send = (phase: 'start' | 'move' | 'end' | 'cancel', event: GestureResponderEvent) => {
    if (!enabled || !owner.current() || !bounds) return;
    const native = event.nativeEvent;
    const all = native.touches ?? [];
    observeReleaseBarrier(controller.input, all.map(point => Number(point.identifier)));
    const changed = native.changedTouches?.length ? native.changedTouches : [native];
    const targets = (native as NativeTouchEvent & { targetTouches?: NativeTouchEvent[] }).targetTouches;
    const touches = phase === 'start' ? targetChangedTouches(changed, targets) : changed;
    if (phase === 'start' && all.length >= 3) {
      retainPausePointers(controller, all.map(point => Number(point.identifier)));
      onPause(); return;
    }
    for (const point of touches) {
      const accepted = vaultPointer(controller, phase, Number(point.identifier), { x: point.locationX + bounds.left, y: point.locationY + bounds.top }, width, height);
      if (accepted && phase !== 'move') onChange();
    }
  };
  if (!bounds || mode === 'explore') return null;
  return <View testID="vault-device-touch" accessible={false} pointerEvents={enabled ? 'auto' : 'none'}
    style={{ position: 'absolute', left: bounds.left, top: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }}
    onTouchStart={event => send('start', event)} onTouchMove={event => send('move', event)}
    onTouchEnd={event => send('end', event)} onTouchCancel={event => send('cancel', event)} />;
}
export function VaultDeviceHeading({ puzzle }: { puzzle: VaultDevice }) {
  return <View pointerEvents="none" style={styles.heading} testID="vault-device-heading">
    <Text style={styles.caption} testID="vault-device-objective">{puzzle === 'length' ? '固定して格子を開く' : '針をロックして、搬出口を開く'}</Text>
    <Text style={styles.caption}>{puzzle === 'length' ? '下の棒を見本と同じ長さに' : '傾いた枠の中で、針を鉛直にする'}</Text>
  </View>;
}
function Button({ label, disabled, onPress, sessionKey }: { label: string; disabled: boolean; onPress: () => void; sessionKey: string }) {
  return <SceneActionButton label={label} disabled={disabled} onPress={onPress} sessionKey={sessionKey} style={[styles.button, disabled && styles.disabled]}>
    <Text pointerEvents="none" style={styles.caption}>{label}</Text>
  </SceneActionButton>;
}
export function VaultDeviceControls({ controller, enabled, onChange, simple, reader, sessionKey }: Common & { simple: boolean; reader: boolean; sessionKey: string }) {
  const [expanded, setExpanded] = useState(false);
  const mode = controller.runtime.vault?.mode ?? 'explore';
  const owner = useMemo(() => lifetime(enabled, sessionKey + ':' + mode), [enabled, sessionKey, mode]);
  useLayoutEffect(() => { owner.activate(); return () => owner.dispose(); }, [owner]);
  const live = controller.runtime.vault, saved = controller.runtime.progress.vault;
  if (!live || !saved || mode === 'explore') return null;
  const length = mode === 'length', puzzle = saved[mode], dragging = !!live.activeDrag;
  const available = enabled && !!controller.matrices && !controller.retired;
  const run = (action: VaultAction) => { if (!available || !owner.current()) return; vaultAction(controller, action, reader); onChange(); };
  const delta = length ? .02 : Math.PI / 90, value = length ? live.length : live.angle;
  const aided = length ? saved.aids.finsHidden || saved.aids.lengthGuide : saved.aids.frameHidden || saved.aids.plumb;
  const status = puzzle.solved ? length ? '格子が開いた。探索へ戻ろう' : '搬出口へ進もう' : dragging ? '指を離すと位置が決まります' :
    puzzle.attempts ? length ? '長さを調整して、もう一度固定' : '針を調整して、もう一度ロック' : length ? '長さを合わせて固定' : '鉛直に合わせてロック';
  return <View style={styles.controls} testID="vault-device-controls">
    <Text accessibilityLiveRegion="polite" style={styles.caption} testID="vault-device-status">{status}</Text>
    {(simple || reader) && !puzzle.solved ? <View style={styles.adjustment}>
      <View accessible accessibilityRole="adjustable" accessibilityLabel={length ? '棒の長さ' : '針の向き'} accessibilityState={{ disabled: !available || dragging }}
        accessibilityValue={{ min: length ? LENGTH_SPEC.minLength : -Math.PI / 2, max: length ? LENGTH_SPEC.maxLength : Math.PI / 2, now: value,
          text: length && saved.aids.lengthGuide ? `${Math.round(value * 100)}センチ、見本は${LENGTH_SPEC.targetLength * 100}センチ` : !length && saved.aids.plumb ? `鉛直から${Math.round(value * 180 / Math.PI)}度` : length ? '右端を左右に調整できます' : '針を左右に回せます' }}
        accessibilityActions={[{ name: 'decrement', label: length ? '短くする' : '左へ回す' }, { name: 'increment', label: length ? '長くする' : '右へ回す' }]}
        onAccessibilityAction={event => { if (!dragging && (event.nativeEvent.actionName === 'increment' || event.nativeEvent.actionName === 'decrement')) run({ type: 'adjust', delta: (event.nativeEvent.actionName === 'increment' ? 1 : -1) * delta }); }} style={styles.semantic}>
        <Text style={styles.caption}>{length ? '棒の長さ' : '針の向き'}</Text>
      </View>
      <View style={styles.row}><Button label={length ? '短くする' : '左へ2°'} disabled={!available || dragging} sessionKey={sessionKey} onPress={() => run({ type: 'adjust', delta: -delta })} />
        <Button label={length ? '長くする' : '右へ2°'} disabled={!available || dragging} sessionKey={sessionKey} onPress={() => run({ type: 'adjust', delta })} /></View>
    </View> : null}
    <View style={styles.row}>
      {!puzzle.solved ? <Button label={length ? '固定する' : 'ロックする'} disabled={!available || dragging} sessionKey={sessionKey} onPress={() => run({ type: 'commit' })} /> : null}
      <Button label={expanded ? '補助を閉じる' : aided ? '補助（使用中）' : '補助'} disabled={!available || dragging} sessionKey={sessionKey} onPress={() => { if (owner.current()) setExpanded(!expanded); }} />
      <Button label="探索へ戻る" disabled={!available} sessionKey={sessionKey} onPress={() => run({ type: 'leave' })} />
    </View>
    {expanded ? <>
      <Text style={styles.caption}>{length ? `端の飾り：${saved.aids.finsHidden ? 'なし' : 'あり'} ／ 測定ガイド：${saved.aids.lengthGuide ? 'オン' : 'オフ'}` : `傾いた枠：${saved.aids.frameHidden ? 'なし' : 'あり'} ／ 下げ振り：${saved.aids.plumb ? 'オン' : 'オフ'}`}</Text>
      <View style={styles.row}><Button label={length ? saved.aids.finsHidden ? '端の飾りを戻す' : '端の飾りを畳む' : saved.aids.frameHidden ? '枠を戻す' : '枠を消す'} disabled={!available || dragging} sessionKey={sessionKey}
        onPress={() => run({ type: 'aid', aid: length ? 'finsHidden' : 'frameHidden', enabled: length ? !saved.aids.finsHidden : !saved.aids.frameHidden })} />
        <Button label={length ? saved.aids.lengthGuide ? '測定ガイドを消す' : '測定ガイド' : saved.aids.plumb ? '下げ振りを消す' : '下げ振り'} disabled={!available || dragging} sessionKey={sessionKey}
          onPress={() => run({ type: 'aid', aid: length ? 'lengthGuide' : 'plumb', enabled: length ? !saved.aids.lengthGuide : !saved.aids.plumb })} /></View>
    </> : null}
  </View>;
}
const styles = StyleSheet.create({
  heading: { padding: 8, gap: 3, borderRadius: 10, backgroundColor: '#172522E8' },
  controls: { padding: 8, gap: 6, borderRadius: 10, backgroundColor: '#172522E8' },
  caption: { color: '#ECEADC', fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  button: { minHeight: 48, minWidth: 48, flexGrow: 1, paddingHorizontal: 9, paddingVertical: 8,
    borderWidth: 1, borderColor: '#A9AA93', borderRadius: 10, backgroundColor: '#243A34', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: .5 }, adjustment: { gap: 4 }, semantic: { minHeight: 44, justifyContent: 'center', padding: 6 },
});
