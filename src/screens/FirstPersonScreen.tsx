import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, Body, ChoiceRow, Heading, SettingSwitch } from '../components/Layout';
import { CHAPTER_ID, createCheckpoint, hintForRuntime, type CheckpointState, type HintStage } from '../domain/firstPerson';
import { playSelectionHaptic } from '../platform/haptics';
import { FirstPersonCanvas } from '../rendering/firstPerson/FirstPersonCanvas';
import { serializeDiagnostics, setDiagnosticsOpen, updateDiagnosticContext } from '../rendering/firstPerson/diagnostics';
import { RawGLProof } from '../rendering/firstPerson/RawGLProof';
import { commandController, controllerSnapshot, createController, interactController, stopController, type RuntimeSnapshot } from '../rendering/firstPerson/runtimeController';
import { TouchControls } from '../rendering/firstPerson/TouchControls';
import type { PreferredColor } from '../rendering/IllusionPalette';
import { UI_COLORS } from '../theme/ui';
import type { AppSettings, FirstPersonChapterSummary, FirstPersonControls } from '../types/application';
import { effectiveControlMode, firstGuideInstruction, simpleGuideAimInstruction } from './firstPersonControlMode';

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

type RecoveryScene = 'chapter' | 'proof' | 'raw-gl';
const MAX_RENDER_RETRIES = 2;

export function FirstPersonScreen(props: FirstPersonScreenProps) {
  const [session, setSession] = useState(() => ({ checkpoint: props.checkpoint, attempt: 0, mode: 'chapter' as RecoveryScene }));
  const [neutralColors, setNeutralColors] = useState(false);
  return <FirstPersonSession key={`${session.attempt}-${session.mode}`} {...props} startCheckpoint={session.checkpoint} attempt={session.attempt} renderMode={session.mode} neutralColors={neutralColors} onColorChange={setNeutralColors} onSessionChange={(checkpoint, mode, retry) => setSession((previous) => ({ checkpoint: previous.mode === 'chapter' ? checkpoint : previous.checkpoint, mode, attempt: previous.attempt + (retry ? 1 : 0) }))} />;
}

function FirstPersonSession({ settings, controls, preferredColor, onSettingsChange, onControlsChange, onCheckpoint, onComplete, onRestart, onExit, scene = 'chapter', startCheckpoint, attempt, renderMode, neutralColors, onColorChange, onSessionChange }: FirstPersonScreenProps & {
  startCheckpoint: CheckpointState | undefined; attempt: number; renderMode: RecoveryScene; neutralColors: boolean;
  onColorChange: (neutral: boolean) => void;
  onSessionChange: (checkpoint: CheckpointState, mode: RecoveryScene, retry: boolean) => void;
}) {
  const [controller] = useState(() => createController(startCheckpoint, scene === 'lab'));
  const [snapshot, setSnapshot] = useState(() => controllerSnapshot(controller));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [menu, setMenu] = useState<'pause' | 'hints' | 'settings'>('pause');
  const [reader, setReader] = useState(false);
  const [notice, setNotice] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [copyStatus, setCopyStatus] = useState('');
  const [diagnosticText, setDiagnosticText] = useState('');
  const mounted = useRef(true);
  const failed = useRef(false);
  const completed = useRef(false);
  const lastProgress = useRef(JSON.stringify(snapshot.runtime.progress));
  const lastAnnounced = useRef('');
  const lastTarget = useRef(snapshot.target?.id);
  const lastVariant = useRef(snapshot.runtime.progress.variant);
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 650 || fontScale >= 1.5;
  const effectiveControls = effectiveControlMode(controls.movementMode, settings.reducedMotion, reader, fontScale);
  const simple = effectiveControls.mode === 'simple';
  const paused = snapshot.runtime.paused;
  const blocked = paused || !appActive || !ready || !!error || snapshot.runtime.progress.cleared || renderMode !== 'chapter';

  const publish = useCallback((next: RuntimeSnapshot) => {
    if (!mounted.current || failed.current || next.runtime !== controller.runtime) return;
    setSnapshot(next);
    if (renderMode !== 'chapter') return;
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
  }, [controller, onCheckpoint, onComplete, renderMode, scene, settings.reducedMotion]);
  const pause = useCallback(() => {
    if (!mounted.current || failed.current) return;
    stopController(controller);
    commandController(controller, { type: 'pause' });
    publish(controllerSnapshot(controller));
    if (scene === 'chapter' && renderMode === 'chapter') onCheckpoint(createCheckpoint(controller.runtime));
  }, [controller, onCheckpoint, publish, renderMode, scene]);
  const resume = () => {
    if (!mounted.current || failed.current) return;
    setNotice('');
    stopController(controller);
    commandController(controller, { type: 'resume' });
    publish(controllerSnapshot(controller));
  };
  const fail = useCallback((message: string) => {
    if (!mounted.current || failed.current) return;
    failed.current = true;
    stopController(controller);
    commandController(controller, { type: 'pause' });
    setSnapshot(controllerSnapshot(controller));
    setReady(false);
    setError(message);
  }, [controller]);
  const canvasReady = useCallback(() => { if (mounted.current && !failed.current) setReady(true); }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; commandController(controller, { type: 'pause' }); };
  }, [controller]);
  useEffect(() => {
    commandController(controller, { type: 'sensitivity', value: controls.sensitivity });
    stopController(controller);
  }, [controller, controls.sensitivity, controls.handedness, simple]);
  useEffect(() => {
    updateDiagnosticContext(controller.diagnostics, { effectiveControls: { mode: effectiveControls.mode, reason: effectiveControls.reason }, appActive, paused, sceneMode: renderMode === 'chapter' ? scene : renderMode });
  }, [appActive, controller, effectiveControls.mode, effectiveControls.reason, paused, renderMode, scene]);
  useEffect(() => {
    setDiagnosticsOpen(controller.diagnostics, showDiagnostics);
    if (!showDiagnostics) return;
    const refresh = () => setDiagnosticText(serializeDiagnostics(controller.diagnostics));
    refresh();
    const timer = appActive ? setInterval(refresh, 500) : undefined;
    return () => { if (timer !== undefined) clearInterval(timer); setDiagnosticsOpen(controller.diagnostics, false); };
  }, [appActive, controller, showDiagnostics]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (!mounted.current) return;
      setAppActive(state === 'active');
      if (!failed.current && state !== 'active') { setMenu('pause'); pause(); }
    });
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
    if (failed.current || scene !== 'chapter' || renderMode !== 'chapter' || !snapshot.runtime.progress.cleared || completed.current) return;
    completed.current = true;
    onComplete({ chapterId: CHAPTER_ID, seals: 2, discoveredMechanisms: ['消えない床', '重なる鍵', '戻ったはずの入口'] });
  }, [onComplete, renderMode, scene, snapshot.runtime.progress.cleared]);

  const examine = () => {
    if (!mounted.current || failed.current || blocked || !snapshot.target) return;
    const previous = controller.runtime;
    const changed = interactController(controller, snapshot.target.id);
    publish(controllerSnapshot(controller));
    if (changed) {
      setNotice(controller.runtime.progress.exitDoorOpen && !previous.progress.exitDoorOpen ? '扉が開きます。自分で外へ歩こう。' : controller.runtime.progress.sealB && !previous.progress.sealB ? '鍵が重なりました。入口へ戻ろう。' : controller.runtime.progress.sealA && !previous.progress.sealA ? '封印が解けました。' : 'しるべを調べました。足跡をたどり、床の輪へ進もう。');
      void playSelectionHaptic(settings.haptics);
    } else if ((snapshot.target.id === 'floor-device' && previous.progress.sealA) || (snapshot.target.id === 'key' && previous.progress.sealB)) setNotice('この封印は、すでに解けています。');
    else if (snapshot.target.id === 'guide' && previous.progress.guideExamined) setNotice('足跡は、途切れていない。');
    else setNotice(snapshot.target.id === 'floor-device' ? '光のしるべと、中央の輪を確かめよう。' : '立つ場所と視線を確かめよう。');
  };
  const step = (forward: number) => {
    if (!mounted.current || failed.current || blocked) return;
    stopController(controller);
    commandController(controller, { type: 'step', forward });
  };
  const turn = (yaw: number, pitch = 0) => {
    if (!mounted.current || failed.current || blocked) return;
    stopController(controller);
    commandController(controller, { type: 'turn', yaw, pitch });
    publish(controllerSnapshot(controller));
  };
  const toggleColor = () => {
    if (!mounted.current || failed.current || blocked) return;
    onColorChange(!neutralColors);
    setNotice(neutralColors ? '色模様を戻しました。' : '模様だけをグレーにしました。床とつながりは同じです。');
  };
  const openMenu = (section: 'pause' | 'hints' | 'settings') => {
    if (!mounted.current || failed.current) return;
    setMenu(section);
    if (section === 'hints' && controller.runtime.progress.hintStage === 0) commandController(controller, { type: 'hint', stage: 1 });
    pause();
  };
  const nextHint = () => {
    if (!mounted.current || failed.current || renderMode !== 'chapter') return;
    commandController(controller, { type: 'hint', stage: Math.min(3, controller.runtime.progress.hintStage + 1) as HintStage });
    publish(controllerSnapshot(controller));
  };
  const aim = () => {
    if (!mounted.current || failed.current || !ready || renderMode !== 'chapter') return;
    const previous = controller.runtime;
    commandController(controller, { type: 'aim' });
    const next = controller.runtime;
    publish(controllerSnapshot(controller));
    resume();
    setNotice(next.pose === previous.pose ? '目印や対象の近くまで、自分で歩こう。' : '視点を合わせました。位置は同じです。');
  };
  const leave = () => { pause(); onExit(); };
  const restart = () => { commandController(controller, { type: 'pause' }); onRestart(); };
  const changeSession = (mode: RecoveryScene, retry = false) => {
    if (retry && attempt >= MAX_RENDER_RETRIES) return;
    stopController(controller);
    commandController(controller, { type: 'pause' });
    failed.current = true;
    onSessionChange(createCheckpoint(controller.runtime), mode, retry);
  };
  const hint = hintForRuntime(snapshot.runtime);
  const cue = snapshot.cue;
  const targetLabel = snapshot.target?.label ?? (cue.kind === 'approach' ? `${cue.target?.label}に、もう少し近づこう。` : cue.kind === 'aim' ? cue.target?.id === 'guide' && simple ? simpleGuideAimInstruction(snapshot.runtime.pose, cue.target.center) : `${cue.target?.label}に中央の照準を合わせよう。` : '近くの目印に中央の照準を合わせよう。');
  const keyNotAligned = snapshot.target?.id === 'key' && !snapshot.runtime.alignment && !snapshot.runtime.progress.sealB;
  const initialObjective = scene === 'chapter' && !snapshot.runtime.progress.guideExamined ? firstGuideInstruction(effectiveControls.mode) : snapshot.objective;
  const copyDiagnostics = async () => {
    try {
      await Clipboard.setStringAsync(serializeDiagnostics(controller.diagnostics));
      if (mounted.current) setCopyStatus('診断をコピーしました。外部へ送信していません。');
    } catch { if (mounted.current) setCopyStatus('コピーできませんでした。診断はこの画面で確認できます。'); }
  };
  const diagnostics = __DEV__ ? <Modal visible={showDiagnostics} transparent animationType="none" onRequestClose={() => setShowDiagnostics(false)}>
    <View style={styles.backdrop} accessibilityViewIsModal><View style={styles.menuCard}>
      <Heading>描画の診断</Heading>
      <ScrollView contentContainerStyle={styles.menuContent}>
        <Body muted>数値だけでは、部屋が見えているとは判断できません。</Body>
        <Text selectable style={styles.diagnosticText} testID="render-diagnostic-record">{diagnosticText}</Text>
        <ActionButton label="診断をコピー" onPress={() => void copyDiagnostics()} />
        {copyStatus ? <Body>{copyStatus}</Body> : null}
        {renderMode === 'chapter' ? <ActionButton label="R3Fの箱・床・壁を確認" onPress={() => changeSession('proof')} /> : null}
        {renderMode === 'proof' ? <ActionButton label="箱が見えない：生のGLを確認" onPress={() => changeSession('raw-gl')} /> : null}
        {renderMode !== 'chapter' ? <ActionButton label="探索へ戻る（進行を維持）" onPress={() => changeSession('chapter')} /> : null}
        <ActionButton label="診断を閉じる" onPress={() => setShowDiagnostics(false)} />
      </ScrollView>
    </View></View>
  </Modal> : null;

  if (error) return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.errorCard} accessibilityElementsHidden={showDiagnostics} importantForAccessibility={showDiagnostics ? 'no-hide-descendants' : 'auto'}><Heading>3Dを表示できませんでした</Heading><Body>{error}</Body>
    <ActionButton label="表示を再試行" onPress={() => changeSession(renderMode, true)} disabled={attempt >= MAX_RENDER_RETRIES} />
    <Body muted>{attempt >= MAX_RENDER_RETRIES ? 'この起動での再試行を終えました。診断を確認してホームへ戻れます。' : '現在位置と進行を保ったまま、描画を作り直します。'}</Body>
    {__DEV__ ? <ActionButton label="描画の診断" onPress={() => setShowDiagnostics(true)} /> : null}
    <ActionButton label="ホームへ戻る" onPress={onExit} />
  </ScrollView>{diagnostics}</SafeAreaView>;

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
    <GameButton label={snapshot.target?.id === 'guide' ? 'しるべを調べる' : snapshot.target?.id === 'key' && !snapshot.runtime.progress.sealB ? '重ねる' : '調べる'} onPress={examine} disabled={blocked || !snapshot.target || keyNotAligned} testID="interact" />
  </View>;
  return <SafeAreaView style={styles.screen} edges={['top', 'right', 'bottom', 'left']}>
    <View style={styles.sceneArea} testID="first-person-play" accessibilityElementsHidden={paused || showDiagnostics} importantForAccessibility={paused || showDiagnostics ? 'no-hide-descendants' : 'auto'}>
      {renderMode === 'raw-gl' ? <RawGLProof diagnostics={controller.diagnostics} appActive={appActive} onComplete={canvasReady} onError={fail} /> : <FirstPersonCanvas controller={controller} snapshot={snapshot} paused={paused} appActive={appActive} sceneMode={renderMode} neutralColors={neutralColors} preferredColor={preferredColor} effectStrength={settings.effectStrength} assist={settings.depthAssist} reducedMotion={settings.reducedMotion} quality={controls.quality} onSnapshot={publish} onReady={canvasReady} onError={fail} />}
      {!simple && renderMode === 'chapter' ? <TouchControls input={controller.input} enabled={!blocked} handedness={controls.handedness} /> : null}
      <View pointerEvents="box-none" style={styles.header}>
        <GameButton label="一時停止" onPress={() => openMenu('pause')} />
        <Text style={styles.objective}>{renderMode === 'proof' ? '箱・床・壁の形が見えるか確認します。' : renderMode === 'raw-gl' ? '橙色の三角形が見えるか確認します。' : notice || (scene === 'lab' ? '3D確認室' : initialObjective)}</Text>
      </View>
      <View pointerEvents="none" style={styles.reticle}><View style={[styles.reticleDot, snapshot.target && styles.reticleReady]} /></View>
      {!ready ? <View style={styles.loading}><Text style={styles.loadingText}>部屋の描画を準備しています…</Text>{__DEV__ ? <ActionButton label="描画の診断" onPress={() => setShowDiagnostics(true)} /> : null}</View> : null}
      {renderMode !== 'chapter' ? <View style={styles.bottom}>{ready ? <ActionButton label="描画の診断" onPress={() => setShowDiagnostics(true)} /> : null}<ActionButton label="探索へ戻る（進行を維持）" onPress={() => changeSession('chapter')} /></View> : !(simple && compact) ? <View pointerEvents="box-none" style={styles.bottom}>
        <Text style={styles.target} accessibilityLabel={`照準：${targetLabel}`}>{targetLabel}</Text>
        {simple ? <><Text style={styles.direction}>向き：{snapshot.direction}</Text>{simpleButtons}</> : null}
        {actions}
      </View> : null}
    </View>
    {simple && compact && renderMode === 'chapter' ? <ScrollView style={styles.compactControls} contentContainerStyle={styles.compactContent} testID="compact-first-person-controls" accessibilityElementsHidden={paused || showDiagnostics} importantForAccessibility={paused || showDiagnostics ? 'no-hide-descendants' : 'auto'}>
      <Text style={styles.target}>{targetLabel} ／ 向き：{snapshot.direction}</Text>{simpleButtons}{actions}
    </ScrollView> : null}
    <Modal visible={paused && !showDiagnostics} transparent animationType="none" onRequestClose={resume}>
      <View style={styles.backdrop} accessibilityViewIsModal><View style={styles.menuCard}>
        <Heading>{menu === 'pause' ? 'ひと休み' : menu === 'hints' ? 'ヒント' : '操作と快適設定'}</Heading>
        <ScrollView contentContainerStyle={styles.menuContent}>
          {menu === 'pause' ? <>
            <ActionButton label="再開する" onPress={resume} variant="primary" />
            <ActionButton label="ヒント" onPress={() => openMenu('hints')} disabled={!ready || renderMode !== 'chapter'} />
            <ActionButton label="操作と快適設定" onPress={() => setMenu('settings')} />
            <Body muted>{simple ? '一歩ずつ進み、向きを変えて、照準先を調べます。' : controls.handedness === 'left' ? '右のスティックで歩き、左側をドラッグして見回します。' : '左のスティックで歩き、右側をドラッグして見回します。'}</Body>
            {__DEV__ ? <ActionButton label="描画の診断" onPress={() => setShowDiagnostics(true)} /> : null}
            <ActionButton label="章を最初から" onPress={restart} />
            <ActionButton label="ホームへ戻る" onPress={leave} />
          </> : menu === 'hints' ? <>
            <Body>ヒント {Math.max(1, snapshot.runtime.progress.hintStage)} / 3</Body>
            <Body>{hint.text}</Body>
            {snapshot.runtime.progress.hintStage < 3 ? <ActionButton label="次のヒント" onPress={nextHint} /> : <ActionButton label="近くで視点を合わせる" onPress={aim} disabled={!ready} accessibilityHint="位置を移動せず、近くの目印や装置へ視線を合わせます" />}
            <ActionButton label="探索へ戻る" onPress={resume} />
            <ActionButton label="一時停止メニュー" onPress={() => setMenu('pause')} />
          </> : <>
            <Body>現在の操作：{simple ? '簡単操作' : '標準操作'}。理由：{effectiveControls.reason}。</Body>
            <SettingSwitch label="簡単操作の希望" description="操作の希望を保存します。簡単操作は一歩と旋回のボタン、標準操作はスティックと見回す操作です。" value={controls.movementMode === 'simple'} onValueChange={(value) => onControlsChange({ ...controls, movementMode: value ? 'simple' : 'standard' })} />
            {effectiveControls.forced ? <Body muted>希望を標準操作にしていても、上の条件が有効な間は簡単操作を表示します。</Body> : null}
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
    {diagnostics}
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
  loading: { position: 'absolute', top: '40%', left: 20, right: 20, padding: 20, gap: 12, borderRadius: 16, backgroundColor: '#172B27', alignItems: 'center' },
  loadingText: { color: '#EEF0E5', fontSize: 16 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#080F0EE8' },
  menuCard: { maxHeight: '92%', padding: 20, gap: 14, borderRadius: 20, borderWidth: 1, borderColor: '#50635A', backgroundColor: '#172522' },
  menuContent: { gap: 14, paddingBottom: 6 },
  errorCard: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 18 },
  diagnosticText: { fontSize: 12, color: '#EEF0E5', fontFamily: 'monospace' },
});
