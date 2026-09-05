import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, Body, ChoiceRow, Heading, SettingSwitch } from '../components/Layout';
import { CHAPTER_ID, createCheckpoint, hintForRuntime, type CheckpointState, type HintStage } from '../domain/firstPerson';
import { playSelectionHaptic } from '../platform/haptics';
import { FirstPersonCanvas } from '../rendering/firstPerson/FirstPersonCanvas';
import { commandController, controllerSnapshot, createController, interactController, stopController, type RuntimeSnapshot } from '../rendering/firstPerson/runtimeController';
import { TouchControls } from '../rendering/firstPerson/TouchControls';
import type { PreferredColor } from '../rendering/IllusionPalette';
import { UI_COLORS } from '../theme/ui';
import type { AppSettings, FirstPersonChapterSummary, FirstPersonControls } from '../types/application';

export type FirstPersonScreenProps = {
  settings: AppSettings;
  controls: FirstPersonControls;
  checkpoint?: CheckpointState;
  preferredColor: PreferredColor;
  onSettingsChange: (settings: AppSettings) => void;
  onControlsChange: (controls: FirstPersonControls) => void;
  onCheckpoint: (checkpoint: CheckpointState) => void;
  onComplete: (summary: FirstPersonChapterSummary) => void;
  onRestart: () => void;
  onExit: () => void;
  scene?: 'chapter' | 'lab';
};
function GameButton({ label, onPress, disabled = false, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.gameButton, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

export function FirstPersonScreen({ settings, controls, checkpoint, preferredColor, onSettingsChange, onControlsChange, onCheckpoint, onComplete, onRestart, onExit, scene = 'chapter' }: FirstPersonScreenProps) {
  const [controller] = useState(() => createController(checkpoint, scene === 'lab'));
  const [snapshot, setSnapshot] = useState(() => controllerSnapshot(controller));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [neutralColors, setNeutralColors] = useState(false);
  const [menu, setMenu] = useState<'pause' | 'hints' | 'settings'>('pause');
  const [reader, setReader] = useState(false);
  const [notice, setNotice] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const mounted = useRef(true);
  const completed = useRef(false);
  const lastProgress = useRef(JSON.stringify(snapshot.runtime.progress));
  const lastAnnounced = useRef('');
  const lastTarget = useRef(snapshot.target?.id);
  const lastVariant = useRef(snapshot.runtime.progress.variant);
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 650 || fontScale >= 1.5;
  const simple = controls.movementMode === 'simple' || settings.reducedMotion || reader || fontScale >= 1.5;
  const paused = snapshot.runtime.paused;
  const blocked = paused || !ready || !!error || snapshot.runtime.progress.cleared;

  const publish = useCallback((next: RuntimeSnapshot) => {
    if (!mounted.current || next.runtime !== controller.runtime) return;
    setSnapshot(next);
    if (lastTarget.current !== next.target?.id) {
      lastTarget.current = next.target?.id;
      setNotice('');
    }
    if (lastVariant.current !== next.runtime.progress.variant) {
      lastVariant.current = next.runtime.progress.variant;
      if (settings.reducedMotion) setNotice('入口の奥に、新しい空間が開きました。');
    }
    const progress = JSON.stringify(next.runtime.progress);
    if (progress !== lastProgress.current) {
      lastProgress.current = progress;
      if (scene === 'chapter') onCheckpoint(createCheckpoint(next.runtime));
    }
    if (scene === 'chapter' && next.runtime.progress.cleared && !completed.current) {
      completed.current = true;
      onComplete({ chapterId: CHAPTER_ID, seals: 2, discoveredMechanisms: ['消えない床', '重なる鍵', '戻ったはずの入口'] });
    }
  }, [controller, onCheckpoint, onComplete, scene, settings.reducedMotion]);
  const pause = useCallback(() => {
    stopController(controller);
    commandController(controller, { type: 'pause' });
    publish(controllerSnapshot(controller));
    if (scene === 'chapter') onCheckpoint(createCheckpoint(controller.runtime));
  }, [controller, onCheckpoint, publish, scene]);
  const resume = () => {
    setNotice('');
    stopController(controller);
    commandController(controller, { type: 'resume' });
    publish(controllerSnapshot(controller));
  };
  const fail = useCallback((message: string) => {
    stopController(controller);
    commandController(controller, { type: 'pause' });
    if (mounted.current) setError(message);
  }, [controller]);
  const canvasReady = useCallback(() => { if (mounted.current) setReady(true); }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopController(controller); };
  }, [controller]);
  useEffect(() => {
    commandController(controller, { type: 'sensitivity', value: controls.sensitivity });
    stopController(controller);
  }, [controller, controls.sensitivity, controls.handedness, simple]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') { setMenu('pause'); pause(); } });
    return () => listener.remove();
  }, [pause]);
  useEffect(() => {
    let active = true;
    let changed = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => { if (active && !changed) setReader(enabled); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => { changed = true; if (active) setReader(enabled); });
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (!reader) return;
    const message = paused ? '一時停止中。' : `${snapshot.objective} ${snapshot.target ? `照準：${snapshot.target.label}。` : ''}${notice}`;
    if (message === lastAnnounced.current) return;
    lastAnnounced.current = message;
    AccessibilityInfo.announceForAccessibility(message);
  }, [notice, paused, reader, snapshot.objective, snapshot.target]);
  useEffect(() => {
    if (scene !== 'chapter' || !snapshot.runtime.progress.cleared || completed.current) return;
    completed.current = true;
    onComplete({ chapterId: CHAPTER_ID, seals: 2, discoveredMechanisms: ['消えない床', '重なる鍵', '戻ったはずの入口'] });
  }, [onComplete, scene, snapshot.runtime.progress.cleared]);

  const examine = () => {
    if (blocked || !snapshot.target) return;
    const previous = controller.runtime;
    const changed = interactController(controller, snapshot.target.id);
    publish(controllerSnapshot(controller));
    if (changed) {
      setNotice(controller.runtime.progress.exitDoorOpen && !previous.progress.exitDoorOpen ? '扉が開きます。自分で外へ歩こう。' : controller.runtime.progress.sealB && !previous.progress.sealB ? '鍵が重なりました。入口へ戻ろう。' : controller.runtime.progress.sealA && !previous.progress.sealA ? '封印が解けました。' : '足跡は、途切れていない。');
      void playSelectionHaptic(settings.haptics);
    } else if ((snapshot.target.id === 'floor-device' && previous.progress.sealA) || (snapshot.target.id === 'key' && previous.progress.sealB)) setNotice('この封印は、すでに解けています。');
    else if (snapshot.target.id === 'guide' && previous.progress.guideExamined) setNotice('足跡は、途切れていない。');
    else setNotice(snapshot.target.id === 'floor-device' ? '光のしるべと、中央の輪を確かめよう。' : '立つ場所と視線を確かめよう。');
  };
  const step = (forward: number) => {
    if (blocked) return;
    stopController(controller);
    commandController(controller, { type: 'step', forward });
  };
  const turn = (yaw: number, pitch = 0) => {
    if (blocked) return;
    stopController(controller);
    commandController(controller, { type: 'turn', yaw, pitch });
    publish(controllerSnapshot(controller));
  };
  const toggleColor = () => {
    if (blocked) return;
    setNeutralColors((value) => !value);
    setNotice(neutralColors ? '色模様を戻しました。' : '模様だけをグレーにしました。床とつながりは同じです。');
  };
  const openMenu = (section: 'pause' | 'hints' | 'settings') => {
    setMenu(section);
    if (section === 'hints' && controller.runtime.progress.hintStage === 0) commandController(controller, { type: 'hint', stage: 1 });
    pause();
  };
  const nextHint = () => {
    commandController(controller, { type: 'hint', stage: Math.min(3, controller.runtime.progress.hintStage + 1) as HintStage });
    publish(controllerSnapshot(controller));
  };
  const aim = () => {
    const previous = controller.runtime;
    commandController(controller, { type: 'aim' });
    const next = controller.runtime;
    publish(controllerSnapshot(controller));
    resume();
    setNotice(next.pose === previous.pose ? '目印や対象の近くまで、自分で歩こう。' : '視点を合わせました。位置は同じです。');
  };
  const leave = () => { pause(); onExit(); };
  const restart = () => { commandController(controller, { type: 'pause' }); onRestart(); };
  const hint = hintForRuntime(snapshot.runtime);
  const targetLabel = snapshot.target?.label ?? '近づいて照準を合わせる';
  const keyNotAligned = snapshot.target?.id === 'key' && !snapshot.runtime.alignment && !snapshot.runtime.progress.sealB;

  if (error) return <SafeAreaView style={styles.screen}><View style={styles.errorCard}><Heading>3Dを表示できませんでした</Heading><Body>{error}</Body><ActionButton label="ホームへ戻る" onPress={onExit} /></View></SafeAreaView>;

  const simpleButtons = <View style={styles.simpleControls}>
    <GameButton label="左を向く" onPress={() => turn(Math.PI / 8)} disabled={blocked} />
    <GameButton label="前へ一歩" onPress={() => step(1)} disabled={blocked} testID="step-forward" />
    <GameButton label="右を向く" onPress={() => turn(-Math.PI / 8)} disabled={blocked} />
    <GameButton label="上を見る" onPress={() => turn(0, 0.15)} disabled={blocked} />
    <GameButton label="後ろへ一歩" onPress={() => step(-1)} disabled={blocked} />
    <GameButton label="下を見る" onPress={() => turn(0, -0.15)} disabled={blocked} />
  </View>;
  const actions = <View style={styles.actions}>
    <GameButton label={neutralColors ? '色を戻す' : '色をほどく'} onPress={toggleColor} disabled={blocked} />
    <GameButton label={snapshot.target?.id === 'key' && !snapshot.runtime.progress.sealB ? '重ねる' : '調べる'} onPress={examine} disabled={blocked || !snapshot.target || keyNotAligned} testID="interact" />
  </View>;
  return <SafeAreaView style={styles.screen} edges={['top', 'right', 'bottom', 'left']}>
    <View style={styles.sceneArea} testID="first-person-play">
      <FirstPersonCanvas controller={controller} snapshot={snapshot} paused={paused} neutralColors={neutralColors} preferredColor={preferredColor} effectStrength={settings.effectStrength} assist={settings.depthAssist} reducedMotion={settings.reducedMotion} quality={controls.quality} onSnapshot={publish} onReady={canvasReady} onError={fail} />
      {!simple ? <TouchControls input={controller.input} enabled={!blocked} handedness={controls.handedness} /> : null}
      <View pointerEvents="box-none" style={styles.header}>
        <GameButton label="一時停止" onPress={() => openMenu('pause')} />
        <Text style={styles.objective}>{notice || (scene === 'lab' ? '3D確認室' : snapshot.objective)}</Text>
      </View>
      <View pointerEvents="none" style={styles.reticle}><View style={[styles.reticleDot, snapshot.target && styles.reticleReady]} /></View>
      {!ready ? <View style={styles.loading}><Text style={styles.loadingText}>部屋を開いています…</Text></View> : null}
      {!(simple && compact) ? <View pointerEvents="box-none" style={styles.bottom}>
        <Text style={styles.target} accessibilityLabel={`照準：${targetLabel}`}>{targetLabel}</Text>
        {simple ? <><Text style={styles.direction}>向き：{snapshot.direction}</Text>{simpleButtons}</> : null}
        {actions}
      </View> : null}
    </View>
    {simple && compact ? <ScrollView style={styles.compactControls} contentContainerStyle={styles.compactContent} testID="compact-first-person-controls">
      <Text style={styles.target}>{targetLabel} ／ 向き：{snapshot.direction}</Text>{simpleButtons}{actions}
    </ScrollView> : null}
    <Modal visible={paused} transparent animationType="none" onRequestClose={resume}>
      <View style={styles.backdrop} accessibilityViewIsModal><View style={styles.menuCard}>
        <Heading>{menu === 'pause' ? 'ひと休み' : menu === 'hints' ? 'ヒント' : '操作と快適設定'}</Heading>
        <ScrollView contentContainerStyle={styles.menuContent}>
          {menu === 'pause' ? <>
            <ActionButton label="再開する" onPress={resume} variant="primary" />
            <ActionButton label="ヒント" onPress={() => openMenu('hints')} />
            <ActionButton label="操作と快適設定" onPress={() => setMenu('settings')} />
            <Body muted>{simple ? '一歩ずつ進み、向きを変えて、照準先を調べます。' : controls.handedness === 'left' ? '右のスティックで歩き、左側をドラッグして見回します。' : '左のスティックで歩き、右側をドラッグして見回します。'}</Body>
            {__DEV__ ? <>
              <ActionButton label="描画の計測値" onPress={() => setShowDiagnostics((value) => !value)} />
              {showDiagnostics ? <Body muted>{controller.metrics.frames ? `平均フレーム間隔 ${(controller.metrics.elapsed * 1000 / controller.metrics.frames).toFixed(1)} ms ／ ${controller.metrics.drawCalls} draw calls ／ 形状 ${controller.metrics.geometries} ／ テクスチャ ${controller.metrics.textures}` : '描画の計測待ちです。'}
              </Body> : null}
            </> : null}
            <ActionButton label="章を最初から" onPress={restart} />
            <ActionButton label="ホームへ戻る" onPress={leave} />
          </> : menu === 'hints' ? <>
            <Body>ヒント {Math.max(1, snapshot.runtime.progress.hintStage)} / 3</Body>
            <Body>{hint.text}</Body>
            {snapshot.runtime.progress.hintStage < 3 ? <ActionButton label="次のヒント" onPress={nextHint} /> : <ActionButton label="近くで視点を合わせる" onPress={aim} accessibilityHint="位置を移動せず、近くの目印や装置へ視線を合わせます" />}
            <ActionButton label="探索へ戻る" onPress={resume} />
            <ActionButton label="一時停止メニュー" onPress={() => setMenu('pause')} />
          </> : <>
            <SettingSwitch label="簡単操作" description="前後の一歩と角度ごとの旋回をボタンで操作します。" value={controls.movementMode === 'simple'} onValueChange={(value) => onControlsChange({ ...controls, movementMode: value ? 'simple' : 'standard' })} />
            {settings.reducedMotion || reader ? <Body muted>現在は動きを減らす設定か読み上げに合わせて、簡単操作を表示しています。</Body> : null}
            <Body>視点の感度</Body><ChoiceRow>{[0.6, 1, 1.5].map((value, index) => <ActionButton key={value} label={['ゆっくり', '標準', '速め'][index]!} variant={controls.sensitivity === value ? 'primary' : 'secondary'} onPress={() => onControlsChange({ ...controls, sensitivity: value })} />)}</ChoiceRow>
            <SettingSwitch label="左手で見回す" description="スティックを右側、見回す領域を左側にします。" value={controls.handedness === 'left'} onValueChange={(value) => onControlsChange({ ...controls, handedness: value ? 'left' : 'right' })} />
            <SettingSwitch label="描画を軽くする" description="模様の解像度と装飾を減らします。謎の条件は同じです。" value={controls.quality === 'low'} onValueChange={(value) => onControlsChange({ ...controls, quality: value ? 'low' : 'standard' })} />
            <SettingSwitch label="補助表示" description="通行できる床の端を中立色で示します。" value={settings.depthAssist} onValueChange={(value) => onSettingsChange({ ...settings, depthAssist: value, depthAssistOverridden: true })} />
            <SettingSwitch label="動きを減らす" description="簡単操作に切り替え、しるべの移動を省きます。" value={settings.reducedMotion} onValueChange={(value) => onSettingsChange({ ...settings, reducedMotion: value, reducedMotionOverridden: true })} />
            <SettingSwitch label="軽い振動" description="操作が成立したときに知らせます。" value={settings.haptics} onValueChange={(value) => onSettingsChange({ ...settings, haptics: value })} />
            <ActionButton label="一時停止メニュー" onPress={() => setMenu('pause')} />
          </>}
        </ScrollView>
      </View></View>
    </Modal>
  </SafeAreaView>;
}
export default FirstPersonScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI_COLORS.background },
  sceneArea: { flex: 1, minHeight: 200, position: 'relative', overflow: 'hidden' },
  header: { position: 'absolute', top: 8, left: 10, right: 10, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  objective: { flex: 2, backgroundColor: '#142421D9', color: '#EEF0E5', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, lineHeight: 21 },
  reticle: { position: 'absolute', top: '50%', left: '50%', marginLeft: -4, marginTop: -4 },
  reticleDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#F0F0DF', backgroundColor: '#273A3599' },
  reticleReady: { backgroundColor: '#ECE7CA', width: 10, height: 10 },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 10, gap: 7 },
  target: { textAlign: 'center', color: '#F1F0DC', backgroundColor: '#13221BD9', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, fontSize: 14 },
  direction: { color: '#F0EDE0', textAlign: 'center', fontSize: 13 },
  gameButton: { flexGrow: 1, flexBasis: 75, minHeight: 48, minWidth: 44, paddingHorizontal: 9, paddingVertical: 10, backgroundColor: '#203A34E8', borderColor: '#ABBDB0', borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#F2F2E8', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  simpleControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  compactControls: { maxHeight: '48%' },
  compactContent: { gap: 8, padding: 10 },
  disabled: { opacity: 0.5 }, pressed: { opacity: 0.72 },
  loading: { position: 'absolute', top: '40%', left: 20, right: 20, padding: 20, borderRadius: 16, backgroundColor: '#172B27', alignItems: 'center' },
  loadingText: { color: '#EEF0E5', fontSize: 16 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#080F0EE8' },
  menuCard: { maxHeight: '92%', padding: 20, gap: 14, borderRadius: 20, borderWidth: 1, borderColor: '#50635A', backgroundColor: '#172522' },
  menuContent: { gap: 14, paddingBottom: 6 },
  errorCard: { flex: 1, justifyContent: 'center', padding: 24, gap: 18 },
});
