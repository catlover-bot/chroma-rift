import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, Body, Heading, SettingSwitch } from '../components/Layout';
import {
  availableMoves, createLevelState, getNode, hitTestFloor, isBridgeActive, LEVELS, levelReducer, projectLevel, projectPoint,
  type LevelAction, type LevelDefinition, type Point,
} from '../domain/illusion';
import { playSelectionHaptic } from '../platform/haptics';
import { IllusionMazeCanvas } from '../rendering/IllusionMazeCanvas';
import { travelFacing, type ExplorerFacing } from '../rendering/IllusionMotion';
import type { PreferredColor } from '../rendering/IllusionPalette';
import { UI_COLORS } from '../theme/ui';
import type { AppSettings } from '../types/application';

export type IllusionStageSummary = { levelId: string; collectibleCount: number; discoveredMechanisms: string[] };
export type IllusionMazeScreenProps = {
  levelIndex: number;
  settings: AppSettings;
  preferredColor: PreferredColor;
  onSettingsChange: (settings: AppSettings) => void;
  onComplete: (summary: IllusionStageSummary) => void;
  onExit: () => void;
};

function Control({ label, onPress, disabled = false, selected = false }: {
  label: string; onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.control, disabled && styles.disabled, pressed && styles.pressed, selected && styles.selected]}><Text style={styles.controlText}>{label}</Text></Pressable>;
}

function GameplayLayout({ scroll, children }: PropsWithChildren<{ scroll: boolean }>) {
  return scroll ? <ScrollView testID="compact-gameplay" contentContainerStyle={styles.scrollContent}>{children}</ScrollView> : <View testID="standard-gameplay" style={styles.stage}>{children}</View>;
}

export function IllusionMazeScreen(props: IllusionMazeScreenProps) {
  const level = LEVELS[props.levelIndex] ?? LEVELS[0]!;
  return <IllusionStage key={level.id} {...props} level={level} />;
}

function IllusionStage({ level, levelIndex, settings, preferredColor, onSettingsChange, onComplete, onExit }: IllusionMazeScreenProps & { level: LevelDefinition }) {
  const dimensions = useWindowDimensions();
  const scrollLayout = dimensions.fontScale >= 1.5 || dimensions.height < 600;
  const [viewport, setViewport] = useState({ width: dimensions.width, height: Math.max(250, dimensions.height * 0.73) });
  const [state, setState] = useState(() => createLevelState(level, { assist: settings.depthAssist }));
  const [facing, setFacing] = useState<ExplorerFacing>(1);
  const stateRef = useRef(state);
  const mounted = useRef(true);
  const completed = useRef(false);
  const lastAccessibilityMessage = useRef('');
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  const [clearedMenuOpen, setClearedMenuOpen] = useState(false);
  const [readerEnabled, setReaderEnabled] = useState(false);
  const [pauseSection, setPauseSection] = useState<'menu' | 'settings' | 'help'>('menu');
  const [announcement, setAnnouncement] = useState(level.instruction);
  const dispatch = useCallback((action: LevelAction) => {
    if (!mounted.current) return;
    const next = levelReducer(level, stateRef.current, action);
    stateRef.current = next;
    setState(next);
  }, [level]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (status) => {
      if (status !== 'active') {
        setDestinationsOpen(false);
        setPauseSection('menu');
        dispatch({ type: 'pause' });
      }
    });
    return () => listener.remove();
  }, [dispatch]);
  useEffect(() => {
    let active = true;
    let changeObserved = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => { if (active && !changeObserved) setReaderEnabled(enabled); }).catch(() => {
      // The destination sheet remains available when native detection fails.
    });
    const listener = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      changeObserved = true;
      if (active) setReaderEnabled(enabled);
    });
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => { dispatch({ type: 'setAssist', assist: settings.depthAssist }); }, [dispatch, settings.depthAssist]);

  const projection = useMemo(() => projectLevel(level, state.camera, viewport.width, viewport.height), [level, state.camera, viewport]);
  const moves = useMemo(() => availableMoves(level, state), [level, state]);
  const destinationIds = moves.map(({ node }) => node.id);
  const locked = state.status !== 'playing';
  const current = getNode(level, state.currentNodeId);
  const bridgeActive = level.bridges.some((bridge) => isBridgeActive(bridge, state.camera));
  const paused = state.status === 'paused' || clearedMenuOpen;
  const cleared = state.status === 'cleared';
  useEffect(() => {
    if (!readerEnabled) {
      lastAccessibilityMessage.current = '';
      return;
    }
    const message = paused
      ? '一時停止中。再開するか、設定を変更できます。'
      : state.move
        ? `${getNode(level, state.move.to).label}へ移動します。`
        : `${current.label}。${announcement === current.label ? '' : announcement}`;
    if (lastAccessibilityMessage.current === message) return;
    lastAccessibilityMessage.current = message;
    AccessibilityInfo.announceForAccessibility(message);
  }, [announcement, current.label, level, paused, readerEnabled, state.move]);
  const chooseDestination = useCallback((targetId: string) => {
    const previous = stateRef.current;
    dispatch({ type: 'move', targetId });
    if (stateRef.current !== previous && stateRef.current.move) {
      const next = stateRef.current;
      const path = [getNode(level, previous.currentNodeId).position, getNode(level, targetId).position].map((position) => projectPoint(position, next.camera));
      setFacing((last) => travelFacing(path, last));
      setDestinationsOpen(false);
    }
  }, [dispatch, level]);
  const handleTap = useCallback((point: Point) => {
    if (stateRef.current.status !== 'playing' || stateRef.current.camera !== state.camera) return;
    const eligible = availableMoves(level, stateRef.current).map(({ node }) => node.id);
    const destination = hitTestFloor(point, projection, eligible);
    if (destination) chooseDestination(destination);
  }, [chooseDestination, level, projection, state.camera]);
  const handleTravelComplete = useCallback((session: number, token: number) => {
    const previous = stateRef.current;
    dispatch({ type: 'moveComplete', session, token });
    const next = stateRef.current;
    if (next === previous) return;
    if (next.status === 'cleared') setAnnouncement('出口に到着しました。色のある景色と比べられます。');
    else if (next.collected.length > previous.collected.length) {
      setAnnouncement(next.collected.length === level.collectibles.length ? 'かけらがそろいました。出口へ進もう。' : '光のかけらを見つけました。');
      void playSelectionHaptic(settings.haptics);
    } else setAnnouncement(getNode(level, next.currentNodeId).label);
  }, [dispatch, level, settings.haptics]);

  const changeCamera = () => {
    if (stateRef.current.status !== 'playing') return;
    const camera = stateRef.current.camera === 'a' ? 'b' : 'a';
    dispatch({ type: 'camera', camera });
    const connected = level.bridges.some((bridge) => isBridgeActive(bridge, camera));
    setAnnouncement(connected ? '橋の端がそろいました。渡れます。' : '橋の端が離れています。');
    if (connected) void playSelectionHaptic(settings.haptics);
  };
  const toggleColors = () => {
    if (stateRef.current.status === 'moving' || stateRef.current.status === 'paused' || clearedMenuOpen) return;
    dispatch({ type: 'toggleColors' });
    setAnnouncement(stateRef.current.neutralColors ? '色模様をグレーにしました。形とつながりは同じです。' : '色模様を戻しました。');
  };
  const pause = () => {
    setPauseSection('menu');
    setDestinationsOpen(false);
    dispatch({ type: 'pause' });
    if (stateRef.current.status === 'cleared') setClearedMenuOpen(true);
  };
  const resume = () => {
    setClearedMenuOpen(false);
    dispatch({ type: 'resume' });
  };
  const finish = () => {
    if (completed.current || stateRef.current.status !== 'cleared') return;
    completed.current = true;
    const discoveries = ['色の床模様'];
    if (stateRef.current.discoveries.some((item) => item.includes('color') || item.includes('neutral'))) discoveries.push('色をほどく');
    if (level.bridges.length) discoveries.push('視点でつながる橋');
    onComplete({ levelId: level.id, collectibleCount: stateRef.current.collected.length, discoveredMechanisms: discoveries });
  };
  const restart = () => {
    completed.current = false;
    setFacing(1);
    setClearedMenuOpen(false);
    setAnnouncement(level.instruction);
    dispatch({ type: 'restart' });
  };
  const statusText = state.status === 'moving' ? '移動中' : cleared ? 'クリア' : announcement;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'right', 'bottom', 'left']}>
      <GameplayLayout scroll={scrollLayout}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="一時停止" onPress={pause} style={styles.pauseButton}><Text style={styles.pauseIcon}>Ⅱ</Text></Pressable>
        <Text style={styles.title}>{level.title}</Text>
        <Text style={styles.count} accessibilityLabel={`光のかけら ${state.collected.length} / ${level.collectibles.length}`}>◇ {state.collected.length}/{level.collectibles.length}</Text>
      </View>
      <View testID="illusion-game-area" style={[styles.gameArea, scrollLayout && { flex: 0, height: Math.max(230, dimensions.height * 0.48) }]} onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) setViewport((previous) => previous.width === width && previous.height === height ? previous : { width, height });
      }}>
        <IllusionMazeCanvas width={viewport.width} height={viewport.height} level={level} state={state} projection={projection} destinationIds={destinationIds} preferredColor={preferredColor} effectStrength={settings.effectStrength} reducedMotion={settings.reducedMotion} facing={facing} onTap={handleTap} onTravelComplete={handleTravelComplete} />
        {level.bridges.length ? <View pointerEvents="none" style={styles.bridgeStatus}><Text style={styles.bridgeStatusText}>{bridgeActive ? '◇ 橋がつながる視点' : '視点を変えて、橋をつなごう'}</Text></View> : null}
      </View>
      <View style={styles.footer}>
        <Text style={styles.status} accessibilityLabel={`${current.label}。${statusText}`}>{statusText}</Text>
        <View style={styles.controls}>
          {level.cameras.length > 1 ? <Control label={state.status === 'moving' ? '視点（移動中）' : '視点を変える'} onPress={changeCamera} disabled={locked} /> : null}
          <Control label={state.neutralColors ? '色を戻す' : '色をほどく'} onPress={toggleColors} disabled={state.status === 'moving' || paused} selected={state.neutralColors} />
          {!cleared ? <Control label="移動先" onPress={() => setDestinationsOpen(true)} disabled={locked} /> : <Control label={levelIndex === 0 ? '次のステージ' : '結果を見る'} onPress={finish} />}
        </View>
        {readerEnabled && !cleared ? <ScrollView horizontal contentContainerStyle={styles.readerDestinations} accessibilityLabel="現在選べる移動先">
          {moves.map(({ node, edge }) => <ActionButton key={node.id} label={`${node.label}へ${edge.kind === 'projection' ? '（つながった橋）' : ''}`} onPress={() => chooseDestination(node.id)} disabled={locked} testID={`destination-${node.id}`} />)}
        </ScrollView> : null}
      </View>
      </GameplayLayout>
      <Modal visible={destinationsOpen && !paused} transparent animationType="none" onRequestClose={() => setDestinationsOpen(false)}>
        <View style={styles.modalBackdrop} accessibilityViewIsModal>
          <View style={styles.modalCard}>
            <Heading>移動先</Heading>
            <Body muted>現在地：{current.label}</Body>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {moves.map(({ node, edge }) => <ActionButton key={node.id} label={`${node.label}へ${edge.kind === 'projection' ? '（つながった橋）' : ''}`} accessibilityHint="隣接する床へ一区間だけ移動します" onPress={() => chooseDestination(node.id)} disabled={locked} testID={`destination-${node.id}`} />)}
              <ActionButton label="閉じる" onPress={() => setDestinationsOpen(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={paused} transparent animationType="none" onRequestClose={resume}>
        <View style={styles.modalBackdrop} accessibilityViewIsModal>
          <View style={styles.modalCard}>
            <Heading>{pauseSection === 'settings' ? '遊びの設定' : pauseSection === 'help' ? '遊び方とヒント' : 'ひと休み'}</Heading>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {pauseSection === 'menu' ? <>
                <ActionButton label="再開する" variant="primary" onPress={resume} />
                <ActionButton label="設定" onPress={() => setPauseSection('settings')} />
                <ActionButton label="遊び方・ヒント" onPress={() => setPauseSection('help')} />
                <ActionButton label="ステージをやり直す" onPress={restart} />
                <ActionButton label="ホームへ戻る" onPress={onExit} />
              </> : pauseSection === 'settings' ? <>
                <SettingSwitch label="補助表示" description="行ける床の輪郭と足元の印を表示します。" value={settings.depthAssist} onValueChange={(value) => onSettingsChange({ ...settings, depthAssist: value, depthAssistOverridden: true })} />
                <SettingSwitch label="動きを減らす" description="歩行の揺れを止め、移動を短くします。" value={settings.reducedMotion} onValueChange={(value) => onSettingsChange({ ...settings, reducedMotion: value, reducedMotionOverridden: true })} />
                <SettingSwitch label="軽い振動" description="かけらと橋の接続を知らせます。" value={settings.haptics} onValueChange={(value) => onSettingsChange({ ...settings, haptics: value })} />
                <ActionButton label="一時停止メニューへ" onPress={() => setPauseSection('menu')} />
              </> : <>
                <Body>隣の床をタップして、光のかけらを集めよう。</Body>
                <Body muted>床を選びにくいときは「移動先」から名前で選べます。行き止まりからも戻れます。</Body>
                <Body>{levelIndex === 0 ? '分岐をたどり、階段の上と下を探してみよう。' : '視点を変えて、橋をつなごう。'}</Body>
                <Body muted>赤と青の模様の見え方には個人差があります。「色をほどく」で同じ景色をグレーの模様と比べられます。</Body>
                {level.bridges.length ? <Body muted>橋は画面上の端がそろう視点で渡れます。色の見え方とは別の、この迷宮の仕掛けです。</Body> : null}
                <Body muted>違和感があるときは、いつでもここで休めます。</Body>
                <ActionButton label="一時停止メニューへ" onPress={() => setPauseSection('menu')} />
              </>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI_COLORS.background },
  stage: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 52, paddingHorizontal: 12, paddingVertical: 4 },
  pauseButton: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, borderRadius: 14, backgroundColor: '#1B2024' },
  pauseIcon: { color: UI_COLORS.text, fontSize: 23, fontWeight: '600' },
  title: { color: '#E0E5DF', fontSize: 18, fontWeight: '600', flex: 1, textAlign: 'center' },
  count: { color: '#E0DCCB', fontSize: 16, minWidth: 50, textAlign: 'right' },
  gameArea: { flex: 1, minHeight: 140, overflow: 'hidden' },
  bridgeStatus: { position: 'absolute', top: 12, left: 16, right: 16, alignItems: 'center' },
  bridgeStatusText: { color: '#AFB7B5', fontSize: 14, textAlign: 'center' },
  footer: { gap: 7, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  status: { color: '#BCC4BE', fontSize: 14, textAlign: 'center', minHeight: 20 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  control: { flexGrow: 1, flexBasis: 95, minHeight: 48, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 7, paddingVertical: 9, backgroundColor: '#20272B', borderColor: '#4A5558', borderWidth: 1 },
  controlText: { color: '#E3E7DF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  selected: { borderColor: '#B8C1B8', backgroundColor: '#303A3C' },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.7 },
  readerDestinations: { gap: 8, paddingVertical: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(9,9,12,0.88)', justifyContent: 'center', padding: 20 },
  modalCard: { maxHeight: '90%', backgroundColor: '#191F23', borderColor: '#435053', borderWidth: 1, borderRadius: 22, padding: 20, gap: 16 },
  modalContent: { gap: 14, paddingBottom: 4 },
});
