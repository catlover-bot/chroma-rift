import { attachControllerAudio } from '../rendering/firstPerson/runtimeController';
import * as Clipboard from 'expo-clipboard';
import { createGalleryAudio, DEFAULT_AUDIO_PREFERENCES } from '../audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GLYPH_LABELS, PALETTE_IDS, PALETTE_LABELS, sealDescription } from '../domain/emblem';
import { ActionButton, Body, ChoiceRow, Heading, SettingSwitch } from '../components/Layout';
import { CHAPTER_ID, createCheckpoint, hintForRuntime, type CheckpointState, type HintStage, type InteractableId } from '../domain/firstPerson';
import { playSelectionHaptic } from '../platform/haptics';
import { FirstPersonCanvas } from '../rendering/firstPerson/FirstPersonCanvas';
import { serializeDiagnostics, setDiagnosticsOpen, updateDiagnosticContext } from '../rendering/firstPerson/diagnostics';
import { RawGLProof } from '../rendering/firstPerson/RawGLProof';
import { accessibleEmblemTargets, commandController, compareController, controllerSnapshot, createController, createEmblemCommand, dispatchEmblemController, interactAccessibleEmblem, interactController, retireController, setControllerForeground, setControllerScreenReader, stopController, type RuntimeSnapshot } from '../rendering/firstPerson/runtimeController';
import { controlLayout } from '../rendering/firstPerson/controlLayout';
import { SceneActionButton } from '../rendering/firstPerson/SceneActionButton';
import { GalleryDeviceControls, GalleryTouchLayer } from '../rendering/firstPerson/GalleryManipulation';
import { galleryAction, galleryPanelTarget } from '../rendering/firstPerson/galleryController';
import { TouchControls } from '../rendering/firstPerson/TouchControls';
import type { PreferredColor } from '../rendering/IllusionPalette';
import { UI_COLORS } from '../theme/ui';
import { DEFAULT_FIRST_PERSON_ONBOARDING, type FirstPersonOnboarding, type AppSettings, type FirstPersonChapterSummary, type FirstPersonControls } from '../types/application';
import { effectiveControlMode, simpleGuideAimInstruction } from './firstPersonControlMode';

export type FirstPersonScreenProps = {
  settings: AppSettings;
  chapterId?: string;
  controls: FirstPersonControls;
  checkpoint?: CheckpointState;
  onboarding?: FirstPersonOnboarding;
  onOnboardingChange?: (next: FirstPersonOnboarding) => void;
  preferredColor: PreferredColor;
  onSettingsChange: (settings: AppSettings) => void;
  onControlsChange: (controls: FirstPersonControls) => void;
  onCheckpoint: (checkpoint: CheckpointState) => void;
  onComplete: (summary: FirstPersonChapterSummary) => void;
  onRestart: () => void;
  onExit: () => void;
  scene?: 'chapter' | 'lab';
};
function GameButton({ label, onPress, disabled = false, testID, sessionKey }: { label: string; onPress: () => void; disabled?: boolean; testID?: string; sessionKey?: string }) {
  return <SceneActionButton testID={testID} label={label} disabled={disabled} onPress={onPress} sessionKey={sessionKey} style={({ pressed }) => [styles.gameButton, disabled && styles.disabled, pressed && styles.pressed]}><Text pointerEvents="none" style={styles.buttonText}>{label}</Text></SceneActionButton>;
}

type RecoveryScene = 'chapter' | 'proof' | 'raw-gl';
const MAX_RENDER_RETRIES = 2;

export function FirstPersonScreen(props: FirstPersonScreenProps) {
  const [session, setSession] = useState(() => ({ checkpoint: props.checkpoint, attempt: 0, mode: 'chapter' as RecoveryScene }));
  const [neutralColors, setNeutralColors] = useState(false);
  return <FirstPersonSession key={`${session.attempt}-${session.mode}`} {...props} startCheckpoint={session.checkpoint} attempt={session.attempt} renderMode={session.mode} neutralColors={neutralColors} onColorChange={setNeutralColors} onSessionChange={(checkpoint, mode, retry) => setSession((previous) => ({ checkpoint: previous.mode === 'chapter' ? checkpoint : previous.checkpoint, mode, attempt: previous.attempt + (retry ? 1 : 0) }))} />;
}

function FirstPersonSession({ settings, controls, chapterId = CHAPTER_ID, onboarding = DEFAULT_FIRST_PERSON_ONBOARDING, onOnboardingChange, preferredColor, onSettingsChange, onControlsChange, onCheckpoint, onComplete, onRestart, onExit, scene = 'chapter', startCheckpoint, attempt, renderMode, neutralColors, onColorChange, onSessionChange }: FirstPersonScreenProps & {
  startCheckpoint: CheckpointState | undefined; attempt: number; renderMode: RecoveryScene; neutralColors: boolean;
  onColorChange: (neutral: boolean) => void;
  onSessionChange: (checkpoint: CheckpointState, mode: RecoveryScene, retry: boolean) => void;
}) {
  const [controller] = useState(() => createController(startCheckpoint, scene === 'lab', onboarding.tutorialCompleted, chapterId));
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
  const lastGalleryHaptic = useRef(-1);
  const tutorialSaved = useRef(onboarding.tutorialCompleted);
  const onboardingRef = useRef(onboarding);
  useEffect(() => { onboardingRef.current = onboarding; }, [onboarding]);
  const lastTarget = useRef(snapshot.target?.id);
  const lastVariant = useRef(snapshot.runtime.progress.variant);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [sceneSize, setSceneSize] = useState<{ width: number; height: number }>();
  const layout = controlLayout(sceneSize?.width ?? width - insets.left - insets.right, sceneSize?.height ?? height - insets.top - insets.bottom, fontScale, controls.handedness);
  const compact = height < 650 || fontScale >= 1.5;
  const effectiveControls = effectiveControlMode(controls.movementMode, settings.reducedMotion, reader, fontScale);
  const simple = effectiveControls.mode === 'simple';
  const paused = snapshot.runtime.paused;
  const gallery = snapshot.runtime.gallery;
  const manipulating = !!gallery && gallery.mode !== 'explore';
  const controlSessionKey = [simple, controls.handedness, appActive, paused, showDiagnostics, renderMode, gallery?.mode].join(':');
  const blocked = showDiagnostics || paused || !appActive || !ready || !!error || snapshot.runtime.progress.cleared || renderMode !== 'chapter';

  useEffect(() => {
    if (scene !== 'chapter' || renderMode !== 'chapter') return;
    const owner = createGalleryAudio({ sessionId: String(controller.runtime.session) });
    return attachControllerAudio(controller, owner);
  }, [controller, renderMode, scene]);
  useEffect(() => { controller.audio?.updatePreferences(settings.audio ?? DEFAULT_AUDIO_PREFERENCES); }, [controller, settings.audio]);
  useEffect(() => { controller.audio?.setActive(!blocked); }, [blocked, controller]);

  const publish = useCallback((next: RuntimeSnapshot) => {
    if (!mounted.current || failed.current || next.runtime !== controller.runtime) return;
    setSnapshot(next);
    if (renderMode !== 'chapter') return;
    if (scene === 'chapter' && next.tutorial.complete && !tutorialSaved.current) {
      tutorialSaved.current = true;
      onOnboardingChange?.({ ...onboardingRef.current, tutorialCompleted: true });
    }
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
      onComplete({ chapterId, seals: chapterId === CHAPTER_ID ? 2 : 4, discoveredMechanisms: chapterId === CHAPTER_ID ? ['触れない紋章', '重なる鍵', '戻ったはずの入口'] : ['触れない紋章', '影の見本', '描かれていない形', '重なる鍵', '変わった入口'] });
    }
  }, [chapterId, controller, onCheckpoint, onComplete, onOnboardingChange, renderMode, scene, settings.reducedMotion]);
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
    return () => { mounted.current = false; retireController(controller); };
  }, [controller]);
  useEffect(() => {
    commandController(controller, { type: 'sensitivity', value: controls.sensitivity, vertical: controls.verticalSensitivity ?? 1 });
    stopController(controller);
  }, [controller, controls.sensitivity, controls.verticalSensitivity, controls.handedness, simple]);
  useEffect(() => {
    updateDiagnosticContext(controller.diagnostics, { effectiveControls: { mode: effectiveControls.mode, reason: effectiveControls.reason }, appActive, paused, sceneMode: renderMode === 'chapter' ? scene : renderMode });
  }, [appActive, controller, effectiveControls.mode, effectiveControls.reason, paused, renderMode, scene]);
  useEffect(() => {
    setDiagnosticsOpen(controller.diagnostics, showDiagnostics);
    if (showDiagnostics) stopController(controller);
    if (!showDiagnostics) return;
    const refresh = () => setDiagnosticText(serializeDiagnostics(controller.diagnostics));
    refresh();
    const timer = appActive ? setInterval(refresh, 500) : undefined;
    return () => { if (timer !== undefined) clearInterval(timer); setDiagnosticsOpen(controller.diagnostics, false); };
  }, [appActive, controller, showDiagnostics]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (!mounted.current) return;
      setControllerForeground(controller, state === 'active');
      setAppActive(state === 'active');
      if (!failed.current && state !== 'active') { setMenu('pause'); pause(); }
    });
    return () => listener.remove();
  }, [controller, pause]);
  useEffect(() => {
    let active = true;
    let changed = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => { if (active && !changed) { setControllerScreenReader(controller, enabled); setReader(enabled); } }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => { changed = true; if (active) { setControllerScreenReader(controller, enabled); setReader(enabled); } });
    return () => { active = false; listener.remove(); };
  }, [controller]);
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
    onComplete({ chapterId, seals: chapterId === CHAPTER_ID ? 2 : 4, discoveredMechanisms: chapterId === CHAPTER_ID ? ['触れない紋章', '重なる鍵', '戻ったはずの入口'] : ['触れない紋章', '影の見本', '描かれていない形', '重なる鍵', '変わった入口'] });
  }, [chapterId, onComplete, renderMode, scene, snapshot.runtime.progress.cleared]);

  useEffect(() => {
    if (!notice || paused) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice, paused]);

  const changeMode = (movementMode: FirstPersonControls['movementMode']) => {
    if (!mounted.current || failed.current) return;
    stopController(controller);
    onControlsChange({ ...controls, movementMode });
    onOnboardingChange?.({ ...onboardingRef.current, controlChoiceAcknowledged: true });
  };
  const examine = () => {
    if (!mounted.current || failed.current || blocked || !snapshot.target) return;
    const previous = controller.runtime;
    const freshCue = controllerSnapshot(controller).cue;
    const changed = interactController(controller, snapshot.target.id);
    publish(controllerSnapshot(controller));
    if (snapshot.target.id.startsWith('emblem-')) {
      const description = reader && snapshot.target.id === 'emblem-panel' && controller.runtime.emblem.phase !== 'unexamined'
        ? ' ' + sealDescription(controller.runtime.emblem.seed) : '';
      setNotice((controller.feedbackMessage || freshCue.reason || '壁の近くで、印に照準を合わせよう。') + description);
      if (changed && controller.runtime.progress.sealA && !previous.progress.sealA) void playSelectionHaptic(settings.haptics);
    } else if (changed) {
      setNotice(controller.runtime.progress.exitDoorOpen && !previous.progress.exitDoorOpen ? '扉が開きます。自分で外へ歩こう。' : controller.runtime.progress.sealB && !previous.progress.sealB ? '鍵が重なりました。入口へ戻ろう。' : '調べました。');
      void playSelectionHaptic(settings.haptics);
    } else setNotice(freshCue.reason ?? '立つ場所と視線を確かめよう。');
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
    if (!compareController(controller)) {
      setNotice(controller.runtime.emblem.lastCompareMs !== null ? 'ゆっくり見比べよう。' : '紋章の近くで、壁に照準を合わせよう。');
      return;
    }
    if (scene === 'chapter') {
      publish(controllerSnapshot(controller));
      setNotice(controller.feedbackMessage);
    } else {
      onColorChange(!neutralColors);
      setNotice(neutralColors ? '色模様を戻しました。' : '色を外して比べます。形とカメラは同じです。');
    }
  };
  const toggleOutline = (enabled: boolean) => {
    if (!mounted.current || failed.current || renderMode !== 'chapter') return;
    const result = dispatchEmblemController(controller, createEmblemCommand(controller, { type: 'assist', enabled }));
    if (result.accepted) publish(controllerSnapshot(controller));
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
  const leave = () => { if (!mounted.current || failed.current) return; pause(); failed.current = true; retireController(controller); onExit(); };
  const restart = () => { if (!mounted.current || failed.current) return; pause(); failed.current = true; retireController(controller); onRestart(); };
  const changeSession = (mode: RecoveryScene, retry = false) => {
    if (retry && attempt >= MAX_RENDER_RETRIES) return;
    stopController(controller);
    commandController(controller, { type: 'pause' });
    failed.current = true;
    const saved = createCheckpoint(controller.runtime);
    retireController(controller);
    onSessionChange(saved, mode, retry);
  };
  const hint = hintForRuntime(snapshot.runtime);
  const cue = snapshot.cue;
  const targetLabel = snapshot.target?.label ?? (cue.kind === 'approach' ? `${cue.target?.label}に、もう少し近づこう。` : cue.kind === 'aim' ? cue.target?.id === 'guide' && simple ? simpleGuideAimInstruction(snapshot.runtime.pose, cue.target.center) : `${cue.target?.label}に中央の照準を合わせよう。` : '近くの目印に中央の照準を合わせよう。');
  const progress = snapshot.runtime.progress;
  const emblem = snapshot.runtime.emblem;
  const shortObjective = gallery ? snapshot.objective : progress.cleared ? '脱出しました' : progress.exitDoorOpen ? '扉の外へ歩く' : progress.sealB ? '入口へ戻る' : progress.sealA ? '欠けた鍵を探す' : emblem.phase === 'unexamined' ? '壁の紋章を調べる' : '切れずにつながる輪郭を探す';
  const colorIsNeutral = scene === 'chapter' ? emblem.presentation === 'neutral' : neutralColors;
  const compareAvailable = scene === 'lab' || ['emblem-panel', 'shadow-panel', 'contour-panel'].includes(snapshot.target?.id ?? '');
  const colorLabel = cue.target?.id === 'shadow-panel' ? gallery?.shadowCompare ? '周囲を戻す' : '周囲を外す' : cue.target?.id === 'contour-panel' ? gallery?.contourGuide ? 'ガイドを消す' : '輪郭ガイド' : colorIsNeutral ? '色を戻す' : '色をほどく';
  const actionLabel = cue.actionLabel ?? '調べる';
  const contextLabel = cue.kind === 'approach' ? `${cue.target?.label} · 近づくと調べられます` : cue.kind === 'locked' ? cue.reason : snapshot.target?.label;
  const intro = !simple && scene === 'chapter' && !snapshot.tutorial.complete;
  const moveSide = controls.handedness === 'right' ? '左' : '右';
  const lookSide = controls.handedness === 'right' ? '右' : '左';
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

  const simpleButtons = <View style={styles.simpleControls} testID="button-movement-controls">
    <GameButton sessionKey={controlSessionKey} label="左を向く" onPress={() => turn(Math.PI / 8)} disabled={blocked} />
    <GameButton sessionKey={controlSessionKey} label="前へ一歩" onPress={() => step(1)} disabled={blocked} testID="step-forward" />
    <GameButton sessionKey={controlSessionKey} label="右を向く" onPress={() => turn(-Math.PI / 8)} disabled={blocked} />
    <GameButton sessionKey={controlSessionKey} label="上を見る" onPress={() => turn(0, 0.15)} disabled={blocked} />
    <GameButton sessionKey={controlSessionKey} label="後ろへ一歩" onPress={() => step(-1)} disabled={blocked} />
    <GameButton sessionKey={controlSessionKey} label="下を見る" onPress={() => turn(0, -0.15)} disabled={blocked} />
  </View>;
  const accessibleTargets = reader ? accessibleEmblemTargets(controller) : [];
  const accessibleObjects = reader && accessibleTargets.length ? <View accessible accessibilityRole="text" testID="accessible-emblem-objects"
    accessibilityLabel={emblem.phase === 'unexamined' ? '近くの紋章と印。アクションから紋章を調べられます。' : sealDescription(emblem.seed)}
    accessibilityActions={accessibleTargets.map((target) => ({ name: target.id, label: target.id === 'emblem-panel' ? '紋章を調べる' : GLYPH_LABELS[target.id.slice(7) as keyof typeof GLYPH_LABELS] + 'の印を押す' }))}
    onAccessibilityAction={(event) => {
      if (blocked || failed.current || !mounted.current) return;
      const changed = interactAccessibleEmblem(controller, event.nativeEvent.actionName as InteractableId);
      publish(controllerSnapshot(controller));
      setNotice(controller.feedbackMessage + (controller.runtime.emblem.phase !== 'unexamined' ? ' ' + sealDescription(controller.runtime.emblem.seed) : ''));
      if (changed && controller.runtime.emblem.phase === 'released') void playSelectionHaptic(settings.haptics);
    }} style={styles.accessibleObjects}><Text style={styles.contextText}>近くの紋章と印を調べる</Text></View> : null;
  const deviceChanged = () => {
    if (!mounted.current || failed.current) return;
    const next = controllerSnapshot(controller);
    publish(next);
    if (controller.feedbackMessage) setNotice(controller.feedbackMessage);
    const feedback = next.runtime.gallery?.feedback;
    if (feedback?.correct && feedback.sequence !== lastGalleryHaptic.current) { lastGalleryHaptic.current = feedback.sequence; void playSelectionHaptic(settings.haptics); }
  };
  const deviceControls = manipulating ? <GalleryDeviceControls controller={controller} enabled={!blocked} simple={simple} reader={reader} sessionKey={controlSessionKey} onChange={deviceChanged} /> : null;
  const accessibleDevices = reader && gallery && !manipulating ? <View style={styles.actions}>
    {(['shadow', 'contour'] as const).filter(puzzle => !!galleryPanelTarget(controller, puzzle)).map(puzzle => <GameButton key={puzzle} sessionKey={controlSessionKey}
      label={puzzle === 'shadow' ? '影の見本を動かす' : '円盤を動かす'} disabled={blocked} onPress={() => { galleryAction(controller, { type: 'enter', puzzle }, true); deviceChanged(); }} />)}
  </View> : null;
  const actions = <View style={styles.actions}>
    {compareAvailable ? <GameButton sessionKey={controlSessionKey} label={colorLabel} onPress={toggleColor} disabled={blocked} /> : null}
    <GameButton sessionKey={controlSessionKey} label={actionLabel} onPress={examine} disabled={blocked || !snapshot.target} testID="interact" />
  </View>;
  return <SafeAreaView style={styles.screen} edges={['top', 'right', 'bottom', 'left']}>
    <View style={styles.sceneArea} onLayout={(event) => { const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout; if (nextWidth > 0 && nextHeight > 0) setSceneSize((previous) => previous?.width === nextWidth && previous.height === nextHeight ? previous : { width: nextWidth, height: nextHeight }); }} testID="first-person-play" accessibilityElementsHidden={paused || showDiagnostics} importantForAccessibility={paused || showDiagnostics ? 'no-hide-descendants' : 'auto'}>
      {renderMode === 'raw-gl' ? <RawGLProof diagnostics={controller.diagnostics} appActive={appActive} onComplete={canvasReady} onError={fail} /> : <FirstPersonCanvas controller={controller} snapshot={snapshot} paused={paused || showDiagnostics} appActive={appActive} sceneMode={renderMode} neutralColors={neutralColors} preferredColor={preferredColor} effectStrength={settings.effectStrength} emblemPalette={settings.emblemPalette ?? 'baseline'} assist={settings.depthAssist} reducedMotion={settings.reducedMotion} quality={controls.quality} onSnapshot={publish} onReady={canvasReady} onError={fail} />}
      {!simple && !manipulating && renderMode === 'chapter' ? <TouchControls input={controller.input} enabled={!blocked} handedness={controls.handedness} layout={layout} /> : null}
      {manipulating && !simple ? <GalleryTouchLayer controller={controller} enabled={!blocked} width={sceneSize?.width ?? width - insets.left - insets.right} height={sceneSize?.height ?? height - insets.top - insets.bottom} onChange={deviceChanged} onPause={pause} /> : null}
      <View pointerEvents="box-none" style={[styles.hudSlot, layout.pause]}>
        <SceneActionButton label="一時停止" sessionKey={controlSessionKey} onPress={() => openMenu('pause')} style={({ pressed }) => [styles.pauseButton, pressed && styles.pressed]} testID="pause-control">
          <View pointerEvents="none" style={styles.pauseSymbol}><View style={styles.pauseBar} /><View style={styles.pauseBar} /></View>
        </SceneActionButton>
      </View>
      <View pointerEvents="none" style={[styles.hudSlot, layout.goal]}>
        <Text testID="current-objective" style={styles.objective}>{renderMode === 'proof' ? '箱・床・壁の形が見えるか確認します。' : renderMode === 'raw-gl' ? '橙色の三角形が見えるか確認します。' : scene === 'lab' ? '3D確認室' : shortObjective}{scene === 'chapter' && emblem.assist ? ' · 輪郭ガイド使用中' : ''}</Text>
      </View>
      <View pointerEvents="none" style={styles.reticle}><View style={[styles.reticleDot, snapshot.target && styles.reticleReady]} /></View>
      {notice ? <View pointerEvents="none" style={[styles.notice, { top: layout.goal.top + layout.goal.height + 8 }]}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      {!simple && !manipulating && renderMode === 'chapter' ? <>
        {contextLabel ? <View pointerEvents="none" style={[styles.context, { bottom: layout.action.height + 28 }]}><Text style={styles.contextText}>{contextLabel}</Text></View> : null}
        <View pointerEvents="box-none" style={[styles.hudSlot, layout.action]}><GameButton sessionKey={controlSessionKey} label={actionLabel} onPress={examine} disabled={blocked || !snapshot.target} testID="interact" /></View>
        {compareAvailable ? <View pointerEvents="box-none" style={[styles.hudSlot, layout.color]}><GameButton sessionKey={controlSessionKey} label={colorLabel} onPress={toggleColor} disabled={blocked} testID="compare-colors" /></View> : null}
        {intro && !snapshot.tutorial.moved ? <View pointerEvents="none" style={[styles.tutorial, { left: layout.movement.left, width: layout.movement.width, top: layout.movement.top }]}><Text style={styles.tutorialText}>{moveSide}側をドラッグして歩く</Text></View> : null}
        {intro && snapshot.tutorial.moved && !snapshot.tutorial.looked ? <View pointerEvents="none" style={[styles.tutorial, { left: layout.look.left, width: layout.look.width, top: layout.look.top + 30 }]}><Text style={styles.tutorialText}>{lookSide}側をドラッグして見回す</Text></View> : null}
      </> : null}
      {manipulating && !simple ? <View pointerEvents="box-none" style={styles.bottom}>{deviceControls}</View> : null}
      {!ready ? <View style={styles.loading}><Text style={styles.loadingText}>部屋の描画を準備しています…</Text>{__DEV__ ? <ActionButton label="描画の診断" onPress={() => setShowDiagnostics(true)} /> : null}</View> : null}
      {renderMode !== 'chapter' ? <View style={styles.bottom}>{ready ? <ActionButton label="描画の診断" onPress={() => setShowDiagnostics(true)} /> : null}<ActionButton label="探索へ戻る（進行を維持）" onPress={() => changeSession('chapter')} /></View> : simple && !compact ? <View pointerEvents="box-none" style={styles.bottom}>
        <Text style={styles.target} accessibilityLabel={`照準：${targetLabel}`}>{targetLabel}</Text>
        {manipulating ? deviceControls : <><Text style={styles.direction}>向き：{snapshot.direction}</Text>{simpleButtons}{actions}{accessibleObjects}{accessibleDevices}</>}
      </View> : null}
    </View>
    {simple && compact && renderMode === 'chapter' ? <ScrollView style={styles.compactControls} contentContainerStyle={styles.compactContent} testID="compact-first-person-controls" accessibilityElementsHidden={paused || showDiagnostics} importantForAccessibility={paused || showDiagnostics ? 'no-hide-descendants' : 'auto'}>
      <Text style={styles.target}>{targetLabel} ／ 向き：{snapshot.direction}</Text>{manipulating ? deviceControls : <>{simpleButtons}{actions}{accessibleObjects}{accessibleDevices}</>}
    </ScrollView> : null}
    <Modal visible={paused && !showDiagnostics} transparent animationType="none" onRequestClose={resume}>
      <View style={styles.backdrop} accessibilityViewIsModal><View style={styles.menuCard}>
        <Heading>{menu === 'pause' ? 'ひと休み' : menu === 'hints' ? 'ヒント' : '操作と快適設定'}</Heading>
        <ScrollView contentContainerStyle={styles.menuContent}>
          {menu === 'pause' ? <>
            <ActionButton label="再開する" onPress={resume} variant="primary" />
            <Body>{snapshot.objective}</Body>
            <Body muted>操作：{simple ? 'ボタン操作' : 'ドラッグ操作'}</Body>
            {reader ? <Body>読み上げ中は移動・旋回・調べるボタンを表示します。保存したタッチ操作の希望は保持し、読み上げ終了後に戻します。</Body> : null}
            <ChoiceRow>
              <ActionButton label="ドラッグ操作" variant={controls.movementMode === 'standard' ? 'primary' : 'secondary'} onPress={() => changeMode('standard')} />
              <ActionButton label="ボタン操作" variant={controls.movementMode === 'simple' ? 'primary' : 'secondary'} onPress={() => changeMode('simple')} />
            </ChoiceRow>
            {controls.movementMode === 'simple' && !onboarding.controlChoiceAcknowledged ? <View style={styles.choiceNotice}>
              <Body>保存したボタン操作を使っています。ドラッグ操作も試せます。</Body>
              <ActionButton label="ドラッグ操作を試す" onPress={() => { changeMode('standard'); resume(); }} />
              <ActionButton label="今の操作を使う" onPress={() => onOnboardingChange?.({ ...onboardingRef.current, controlChoiceAcknowledged: true })} />
            </View> : null}
            <ActionButton label="ヒント" onPress={() => openMenu('hints')} disabled={!ready || renderMode !== 'chapter'} />
            <ActionButton label="操作と快適設定" onPress={() => setMenu('settings')} />
            <Body muted>{simple ? '一歩ずつ進み、向きを変えて、照準先を調べます。' : controls.handedness === 'left' ? '右側をドラッグして歩き、左側をドラッグして見回します。' : '左側をドラッグして歩き、右側をドラッグして見回します。'}</Body>
            {__DEV__ ? <ActionButton label="描画の診断" onPress={() => setShowDiagnostics(true)} /> : null}
            <ActionButton label={chapterId === CHAPTER_ID ? 'この旧章を最初から' : 'この展示室を最初から'} onPress={restart} />
            <ActionButton label="ホームへ戻る" onPress={leave} />
          </> : menu === 'hints' ? <>
            <Body>ヒント {Math.max(1, snapshot.runtime.progress.hintStage)} / 3</Body>
            <Body>{hint.text}</Body>
            {snapshot.runtime.progress.hintStage < 3 ? <ActionButton label="次のヒント" onPress={nextHint} /> : progress.sealA && (!gallery || (progress.gallery?.shadow.solved && progress.gallery.contour.solved && !progress.sealB && !manipulating)) ? <ActionButton label="近くで視点を合わせる" onPress={aim} disabled={!ready} accessibilityHint="位置を移動せず、鍵の目印へ視線を合わせます" /> : null}
            {!progress.sealA ? <SettingSwitch label="輪郭ガイド" description="切れていない線に静かな中立色の目印を重ねます。補助表示だけでは扉は開きません。" value={emblem.assist} onValueChange={toggleOutline} /> : null}
            {reader && emblem.phase !== 'unexamined' ? <Body>{sealDescription(emblem.seed)}</Body> : null}
            <ActionButton label="探索へ戻る" onPress={resume} />
            <ActionButton label="一時停止メニュー" onPress={() => setMenu('pause')} />
          </> : <>
            <Body>現在の操作：{simple ? 'ボタン操作' : 'ドラッグ操作'}。理由：{effectiveControls.reason}。</Body>
            <SettingSwitch label="ボタン操作" description="一歩ずつ進む・向きを変えるボタンを使います。オフにするとドラッグ操作になります。" value={controls.movementMode === 'simple'} onValueChange={(value) => changeMode(value ? 'simple' : 'standard')} />
            {effectiveControls.forced ? <Body muted>読み上げ中はボタンを表示します。保存したタッチ操作の希望は変わりません。</Body> : null}
            <Body>視点の感度</Body><ChoiceRow>{[0.6, 1, 1.5].map((value, index) => <ActionButton key={value} label={['ゆっくり', '標準', '速め'][index]!} variant={controls.sensitivity === value ? 'primary' : 'secondary'} onPress={() => onControlsChange({ ...controls, sensitivity: value })} />)}</ChoiceRow>
            <Body>上下の感度</Body><ChoiceRow>{[0.6, 1].map((value) => <ActionButton key={value} label={value === 1 ? '同じ' : '控えめ'} variant={(controls.verticalSensitivity ?? 1) === value ? 'primary' : 'secondary'} onPress={() => onControlsChange({ ...controls, verticalSensitivity: value })} />)}</ChoiceRow>
            <SettingSwitch label="左手で見回す" description="歩く領域を右側、見回す領域を左側にします。" value={controls.handedness === 'left'} onValueChange={(value) => onControlsChange({ ...controls, handedness: value ? 'left' : 'right' })} />
            <SettingSwitch label="描画を軽くする" description="模様の解像度と装飾を減らします。謎の条件は同じです。" value={controls.quality === 'low'} onValueChange={(value) => onControlsChange({ ...controls, quality: value ? 'low' : 'standard' })} />
            <Body>紋章の色表示</Body><ChoiceRow>{PALETTE_IDS.map((palette) => <ActionButton key={palette} label={PALETTE_LABELS[palette]} variant={(settings.emblemPalette ?? 'baseline') === palette ? 'primary' : 'secondary'} onPress={() => onSettingsChange({ ...settings, emblemPalette: palette })} />)}</ChoiceRow>
            <Body muted>表示名は、奥行きの感じ方の強さを表す順序ではありません。</Body>
            <SettingSwitch label="輪郭ガイド" description="紋章の切れていない線を、中立色の目印で示します。" value={emblem.assist} onValueChange={toggleOutline} />
            <SettingSwitch label="補助表示" description="通行できる床の端を中立色で示します。" value={settings.depthAssist} onValueChange={(value) => onSettingsChange({ ...settings, depthAssist: value, depthAssistOverridden: true })} />
            <SettingSwitch label="動きを減らす" description="印の動きを静かな反応にします。自分で歩く・見回す操作は変わりません。" value={settings.reducedMotion} onValueChange={(value) => onSettingsChange({ ...settings, reducedMotion: value, reducedMotionOverridden: true })} />
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
  objective: { backgroundColor: '#142421B8', color: '#EEF0E5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, lineHeight: 21 },
  reticle: { position: 'absolute', top: '50%', left: '50%', marginLeft: -4, marginTop: -4 },
  reticleDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#F0F0DF', backgroundColor: '#273A3599' },
  reticleReady: { backgroundColor: '#ECE7CA', borderColor: '#FFFFFF' },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 10, gap: 7 },
  target: { textAlign: 'center', color: '#F1F0DC', backgroundColor: '#13221BD9', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, fontSize: 14 },
  direction: { color: '#F0EDE0', textAlign: 'center', fontSize: 13 },
  gameButton: { flexGrow: 1, flexShrink: 1, minHeight: 48, minWidth: 44, paddingHorizontal: 9, paddingVertical: 10, backgroundColor: '#203A34E8', borderColor: '#ABBDB0', borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#F2F2E8', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  accessibleObjects: { minHeight: 44, justifyContent: 'center' },
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
  hudSlot: { position: 'absolute' },
  pauseButton: { flex: 1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#162723D9', borderWidth: 1, borderColor: '#8F9E94' },
  pauseSymbol: { flexDirection: 'row', gap: 5 },
  pauseBar: { width: 4, height: 18, backgroundColor: '#F0EFE5', borderRadius: 1 },
  notice: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  noticeText: { color: '#F4F1DF', backgroundColor: '#142421DC', borderRadius: 8, padding: 8, fontSize: 15, textAlign: 'center' },
  context: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  contextText: { color: '#F4F1DF', backgroundColor: '#142421BA', borderRadius: 8, padding: 6, fontSize: 14, textAlign: 'center' },
  tutorial: { position: 'absolute', padding: 8, alignItems: 'center' },
  tutorialText: { color: '#F2EFDA', backgroundColor: '#142421BA', borderRadius: 8, padding: 6, fontSize: 15, textAlign: 'center' },
  choiceNotice: { gap: 10, padding: 10, borderWidth: 1, borderColor: '#71867B', borderRadius: 12 },
  diagnosticText: { fontSize: 12, color: '#EEF0E5', fontFamily: 'monospace' },
});
