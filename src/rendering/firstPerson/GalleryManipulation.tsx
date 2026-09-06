import { useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type NativeTouchEvent } from 'react-native';
import { CONTOUR_DISC_IDS, createContourSpec, createShadowSpec, SAMPLE_IDS, type SampleId } from '../../domain/gallery';
import { angularDifference, CONTOUR_TOLERANCE } from '../../domain/gallery';
import { galleryAction, galleryPointer } from './galleryController';
import type { RuntimeController } from './runtimeController';
import { SceneActionButton } from './SceneActionButton';
import { targetChangedTouches } from './touchInput';

type Common = { controller: RuntimeController; enabled: boolean; onChange: () => void };
function touchLifetime(controller: RuntimeController, enabled: boolean) {
  let active = enabled;
  return {
    current: () => active,
    activate: () => { active = enabled; },
    dispose: () => { active = false; galleryAction(controller, { type: 'cancel' }); },
  };
}
export function GalleryTouchLayer({ controller, enabled, onChange, width, height, onPause }: Common & { width: number; height: number; onPause: () => void }) {
  const lifetime = useMemo(() => touchLifetime(controller, enabled), [controller, enabled]);
  useLayoutEffect(() => { lifetime.activate(); return () => lifetime.dispose(); }, [lifetime]);
  const send = (phase: 'start' | 'move' | 'end' | 'cancel', event: GestureResponderEvent) => {
    if (!enabled || !lifetime.current()) return;
    const changed = event.nativeEvent.changedTouches?.length ? event.nativeEvent.changedTouches : [event.nativeEvent];
    // Fabric can batch changed touches from sibling action buttons. Acquire
    // ownership only from this view; subsequent events use the acquired ID.
    const targets = (event.nativeEvent as NativeTouchEvent & { targetTouches?: NativeTouchEvent[] }).targetTouches;
    const touches = phase === 'start' ? targetChangedTouches(changed, targets) : changed;
    if (phase === 'start' && event.nativeEvent.touches.length >= 3) { onPause(); return; }
    for (const touch of touches) {
      const changed = galleryPointer(controller, phase, Number(touch.identifier), { x: touch.locationX, y: touch.locationY }, width, height);
      if (changed && phase !== 'move') onChange();
    }
  };
  return <View testID="gallery-device-touch" style={StyleSheet.absoluteFill} pointerEvents={enabled ? 'auto' : 'none'}
    accessible={false} onTouchStart={e => send('start', e)} onTouchMove={e => send('move', e)}
    onTouchEnd={e => send('end', e)} onTouchCancel={e => send('cancel', e)} />;
}
function Button({ label, onPress, disabled, sessionKey, selected = false }: { label: string; onPress: () => void; disabled: boolean; sessionKey: string; selected?: boolean }) {
  return <SceneActionButton label={label} sessionKey={sessionKey} onPress={onPress} disabled={disabled}
    style={[styles.button, selected && styles.selected, disabled && styles.disabled]}><Text style={styles.text} pointerEvents="none">{label}</Text></SceneActionButton>;
}
function controlsLifetime(enabled: boolean, sessionKey: string) {
  let active = enabled;
  return { sessionKey, current: () => active, activate: () => { active = enabled; }, dispose: () => { active = false; } };
}
export function GalleryDeviceControls({ controller, enabled, onChange, simple, reader, sessionKey }: Common & { simple: boolean; reader: boolean; sessionKey: string }) {
  const [selected, setSelected] = useState<SampleId>('sample-a');
  const lifetime = useMemo(() => controlsLifetime(enabled, sessionKey), [enabled, sessionKey]);
  useLayoutEffect(() => { lifetime.activate(); return () => lifetime.dispose(); }, [lifetime]);
  const live = controller.runtime.gallery!, saved = controller.runtime.progress.gallery!;
  const run = (action: Parameters<typeof galleryAction>[1]) => { if (!enabled || !lifetime.current()) return; galleryAction(controller, action); onChange(); };
  const shadow = live.mode === 'shadow', solved = shadow ? saved.shadow.solved : saved.contour.solved;
  const spec = createShadowSpec(saved.shadow.seed, saved.shadow.variant);
  const pair = spec.samples.filter(s => s.color === '#808080').map(s => SAMPLE_IDS.indexOf(s.id) + 1);
  return <View style={styles.controls} testID="gallery-device-controls">
    <Text style={styles.caption}>{solved ? '封印が外れました' : '装置を操作中'} · {shadow ? '影の見本' : '描かれていない形'}</Text>
    {simple && !solved ? shadow ? <>
      {reader ? <Text accessibilityLiveRegion="polite" style={styles.caption}>見本{pair.join('と')}は同じ灰色です。別々の見本を比較台へ置いて確かめられます。</Text> : null}
      <View style={styles.row}>{SAMPLE_IDS.map((id, i) => <Button key={id} label={'見本' + (i + 1)} disabled={!enabled} sessionKey={sessionKey} selected={selected === id} onPress={() => setSelected(id)} />)}</View>
      <View style={styles.row}>
        <Button label="左のソケットへ" disabled={!enabled} sessionKey={sessionKey} onPress={() => run({ type: 'shadow-place', sampleId: selected, slotId: 'socket-left' })} />
        <Button label="右のソケットへ" disabled={!enabled} sessionKey={sessionKey} onPress={() => run({ type: 'shadow-place', sampleId: selected, slotId: 'socket-right' })} />
        <Button label="元の場所へ" disabled={!enabled} sessionKey={sessionKey} onPress={() => run({ type: 'shadow-return', sampleId: selected })} />
      </View>
    </> : <View style={styles.adjustments}>{CONTOUR_DISC_IDS.map(id => {
      const names = ['上', '左下', '右下'], aligned = angularDifference(live.contourAngles[id], createContourSpec(saved.contour.seed).discs[id]!.targetAngle) <= CONTOUR_TOLERANCE;
      return <View key={id} accessible accessibilityRole="adjustable" accessibilityLabel={names[id] + 'の円盤'}
        accessibilityValue={{ text: aligned ? '切り欠きが内側を向いています' : '向きを調整できます' }}
        accessibilityActions={[{ name: 'increment', label: '反時計回りに回す' }, { name: 'decrement', label: '時計回りに回す' }]}
        onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'increment' || e.nativeEvent.actionName === 'decrement') run({ type: 'contour-adjust', discId: id, delta: (e.nativeEvent.actionName === 'increment' ? 1 : -1) * Math.PI / 36 }); }} style={styles.row}>
        <Text style={styles.caption}>{names[id]}{aligned ? ' · 合う' : ''}</Text>
        <Button label="左回り" disabled={!enabled} sessionKey={sessionKey} onPress={() => run({ type: 'contour-adjust', discId: id, delta: Math.PI / 36 })} />
        <Button label="右回り" disabled={!enabled} sessionKey={sessionKey} onPress={() => run({ type: 'contour-adjust', discId: id, delta: -Math.PI / 36 })} />
      </View>;
    })}</View> : !solved ? <Text style={styles.caption}>{shadow ? '見本を下の二つのソケットへドラッグ' : '円盤の縁をなぞって回す'}</Text> : null}
    <View style={styles.row}>
      <Button label={shadow ? live.shadowCompare ? '周囲を戻す' : '周囲を外す' : live.contourGuide ? 'ガイドを消す' : '輪郭ガイド'} disabled={!enabled} sessionKey={sessionKey} onPress={() => run(shadow ? { type: 'compare' } : { type: 'guide', enabled: !live.contourGuide })} />
      {!solved ? <Button label={shadow ? 'つなぐ' : '封印に触れる'} disabled={!enabled || !!live.activeDrag} sessionKey={sessionKey} onPress={() => run({ type: shadow ? 'shadow-commit' : 'contour-commit' })} /> : null}
      <Button label="探索へ戻る" disabled={!enabled} sessionKey={sessionKey} onPress={() => run({ type: 'leave' })} />
    </View>
    {!shadow && live.contourGuide ? <Text style={styles.caption}>輪郭ガイド使用中</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  controls: { gap: 6, padding: 8, borderRadius: 12, backgroundColor: '#172522E8' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  button: { minHeight: 44, minWidth: 44, flexGrow: 1, padding: 9, borderWidth: 1, borderColor: '#A9AA93', borderRadius: 10, backgroundColor: '#243A34', alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: '#F2D38B', borderWidth: 2 }, disabled: { opacity: .5 },
  text: { color: '#F0EFE4', fontSize: 14, textAlign: 'center' },
  caption: { color: '#ECEADC', fontSize: 14, textAlign: 'center' }, adjustments: { gap: 6 },
});
