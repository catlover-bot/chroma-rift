import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { appReducer, initialAppState, persistedFromState } from './src/app/state';
import { createGalleryRuntime } from './src/domain/gallery';
import { createTheatreRuntime, createTheatreCheckpoint } from './src/domain/theatre';
import { createVaultRuntime } from './src/domain/vault/runtime';
import { createVaultCheckpoint } from './src/domain/vault/checkpoint';
import { chapterCompletionSummary } from './src/app/chapterSummary';
import { STAGE_DEFINITIONS, type PlayableStageId } from './src/domain/stageKit/definitions';
import { stageModule } from './src/domain/stageKit/modules';
import { createCheckpoint, createInitialRuntime, type CheckpointState } from './src/domain/firstPerson';
import { CalibrationInstructionsScreen } from './src/screens/CalibrationInstructionsScreen';
import { CalibrationResultScreen } from './src/screens/CalibrationResultScreen';
import { CalibrationScreen } from './src/screens/CalibrationScreen';
import { DeveloperLabScreen } from './src/screens/DeveloperLabScreen';
import { IllusionMazeScreen } from './src/screens/IllusionMazeScreen';
import { JourneyResultScreen } from './src/screens/JourneyResultScreen';
import { MicroMazeScreen } from './src/screens/MicroMazeScreen';
import { NativeFirstPersonGate } from './src/screens/NativeFirstPersonGate';
import { FirstPersonResultScreen } from './src/screens/FirstPersonResultScreen';
import { PlayInstructionsScreen } from './src/screens/PlayInstructionsScreen';
import { QuickSetupScreen } from './src/screens/QuickSetupScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StageResultScreen } from './src/screens/StageResultScreen';
import { StageSelectScreen } from './src/screens/StageSelectScreen';
import { emptyJournal, mergeStageHistory, resumableStage, STAGES, type StageCardState, type StageId } from './src/app/stages';
import {
  createDefaultApplication,
  loadApplication,
  saveApplication,
} from './src/storage/applicationStorage';
import {
  beginFirstPersonSession, isFirstPersonSessionCurrent, loadFirstPersonStorage,
  resetAllApplicationStorage, resetFirstPersonChapter, loadGalleryStorage, resetGalleryChapter, saveGalleryCheckpoint,
  loadTheatreStorage, resetTheatreChapter, saveTheatreCheckpoint,
  loadVaultStorage, resetVaultChapter, saveVaultCheckpoint, loadStageJournal, recordStageHistory, recordStageEntry,
  loadModuleStageStorage, resetModuleStage, saveModuleStageCheckpoint,
  saveFirstPersonCheckpoint, saveFirstPersonControls, saveFirstPersonOnboarding,
} from './src/storage/firstPersonStorage';
import { UI_COLORS } from './src/theme/ui';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_FIRST_PERSON_ONBOARDING, DEFAULT_LAB_PARAMETERS, type FirstPersonControls, type FirstPersonOnboarding, type PersistedApplication } from './src/types/application';

const simpleVisible=(STAGE_DEFINITIONS as readonly {id:string;playerVisible:boolean;renderKind:string}[])
  .filter(stage=>stage.playerVisible&&stage.renderKind==='simple').map(stage=>({id:stage.id as PlayableStageId}));
type SimpleRun={checkpoint:CheckpointState;started:boolean;hasSave:boolean;needsCommit:boolean;blocked:boolean;message?:string|undefined};
function initialSimpleRuns():Record<string,SimpleRun>{
  return Object.fromEntries(simpleVisible.map(stage=>{
    const module=stageModule(stage.id)!;
    return [stage.id,{checkpoint:module.checkpoint(module.create()),started:false,hasSave:false,needsCommit:false,blocked:false}];
  }));
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [journal, setJournal] = useState(emptyJournal);
  const [journalMessage, setJournalMessage] = useState<string | undefined>();
  const [legacyBlocked, setLegacyBlocked] = useState(false);
  const [settingsReturn, setSettingsReturn] = useState<'welcome' | 'playInstructions'>('welcome');
  const [replayPending, setReplayPending] = useState(false);
  const [storageWritable, setStorageWritable] = useState(false);
  const [storageMessage, setStorageMessage] = useState<string | undefined>();
  const [resetting, setResetting] = useState(false);
  const resetInFlight = useRef(false);
  const [galleryStarted, setGalleryStarted] = useState(false);
  const [galleryNeedsCommit, setGalleryNeedsCommit] = useState(false);
  const [controls, setControls] = useState<FirstPersonControls>({ ...DEFAULT_FIRST_PERSON_CONTROLS });
  const [checkpoint, setCheckpoint] = useState<CheckpointState>(() => createCheckpoint(createInitialRuntime()));
  const [galleryCheckpoint, setGalleryCheckpoint] = useState<CheckpointState>(() => createCheckpoint(createGalleryRuntime()));
  const [theatreCheckpoint, setTheatreCheckpoint] = useState<CheckpointState>(() => createTheatreCheckpoint(createTheatreRuntime()));
  const [theatreState, setTheatreState] = useState({ started: false, needsCommit: false, hasSave: false, blocked: false, message: undefined as string | undefined });
  const [simpleRuns,setSimpleRuns]=useState<Record<string,SimpleRun>>(initialSimpleRuns);
  const [vaultCheckpoint, setVaultCheckpoint] = useState<CheckpointState>(() => createVaultCheckpoint(createVaultRuntime()));
  const [vaultStarted, setVaultStarted] = useState(false);
  const [vaultNeedsCommit, setVaultNeedsCommit] = useState(false);
  const [hasVaultSave, setHasVaultSave] = useState(false);
  const [vaultBlocked, setVaultBlocked] = useState(false);
  const [vaultMessage, setVaultMessage] = useState<string | undefined>();
  const [hasLegacySave, setHasLegacySave] = useState(false);
  const [hasGallerySave, setHasGallerySave] = useState(false);
  const [galleryBlocked, setGalleryBlocked] = useState(false);
  const [galleryMessage, setGalleryMessage] = useState<string | undefined>();
  const [firstPersonMessage, setFirstPersonMessage] = useState<string | undefined>();
  const [chapterLease, setChapterLease] = useState(0);
  const selectionRevision = useRef(0);
  const entryRoute = useRef<{ screen: string; chapterId: string; lease: number } | undefined>(undefined);
  useLayoutEffect(() => { entryRoute.current = { screen: state.screen, chapterId: state.selectedChapterId, lease: chapterLease }; }, [state.screen, state.selectedChapterId, chapterLease]);
  const [completedAtEntry, setCompletedAtEntry] = useState(false);
  const [onboarding, setOnboarding] = useState<FirstPersonOnboarding>({ ...DEFAULT_FIRST_PERSON_ONBOARDING });
  const [onboardingWritable, setOnboardingWritable] = useState(false);

  useEffect(() => {
    let active = true;
    const hydrationLease = beginFirstPersonSession();
    void (async () => {
      let systemReducedMotion = false;
      try {
        systemReducedMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        // The in-app setting remains available if the platform preference cannot be read.
      }
      const [loaded, chapter, gallery, vault, theatre, history, simple] = await Promise.all([loadApplication(systemReducedMotion), loadFirstPersonStorage(), loadGalleryStorage(), loadVaultStorage(), loadTheatreStorage(), loadStageJournal(),Promise.all(simpleVisible.map(stage=>loadModuleStageStorage(stage.id)))]);
      if (!active) return;
      setChapterLease(hydrationLease);
      const known = [...[chapter, gallery, vault, theatre],...simple].filter(item => item.hasCheckpoint && item.checkpointWritable).map(item => item.checkpoint);
      setJournal(mergeStageHistory(history.journal, known));
      setJournalMessage(history.message);
      if (history.writable) void recordStageHistory(known, hydrationLease).then(saved => {
        if (active && !saved && isFirstPersonSessionCurrent(hydrationLease)) setJournalMessage('履歴を保存できませんでした。現在の章の記録を保持しています。');
      });
      setLegacyBlocked(!chapter.checkpointWritable);
      setControls(chapter.controls);
      setOnboarding(chapter.onboarding);
      setOnboardingWritable(chapter.onboardingWritable);
      setCheckpoint(chapter.checkpoint);
      setHasLegacySave(chapter.hasCheckpoint);
      setGalleryCheckpoint(gallery.checkpoint);
      setHasGallerySave(gallery.hasCheckpoint);
      setGalleryStarted(gallery.status !== 'empty');
      setGalleryNeedsCommit(gallery.status === 'migrated' || gallery.status === 'recovered');
      setGalleryBlocked(!gallery.checkpointWritable);
      setGalleryMessage(gallery.message);
      setTheatreCheckpoint(theatre.checkpoint);
      setTheatreState({ started: theatre.status !== 'empty', needsCommit: theatre.status === 'recovered', hasSave: theatre.hasCheckpoint, blocked: !theatre.checkpointWritable, message: theatre.message });
      setSimpleRuns(Object.fromEntries(simpleVisible.map((stage,index)=>[stage.id,{checkpoint:simple[index]!.checkpoint,started:simple[index]!.status!=='empty',hasSave:simple[index]!.hasCheckpoint,needsCommit:simple[index]!.status==='recovered',blocked:!simple[index]!.checkpointWritable,message:simple[index]!.message}])));
      setVaultCheckpoint(vault.checkpoint);
      setHasVaultSave(vault.hasCheckpoint);
      setVaultStarted(vault.status !== 'empty');
      setVaultNeedsCommit(vault.status === 'recovered');
      setVaultBlocked(!vault.checkpointWritable);
      setVaultMessage(vault.message);
      setFirstPersonMessage(chapter.message);
      setStorageWritable(loaded.status !== 'blocked');
      setStorageMessage(loaded.message);
      dispatch({ type: 'HYDRATE', persisted: loaded.application, systemReducedMotion });
    })();
    return () => { active = false; };
  }, []);

  // Navigation and transient game actions do not cause duplicate persistence writes.
  const persistedJSON = JSON.stringify(persistedFromState(state));
  useEffect(() => {
    if (!state.hydrated || !storageWritable) return;
    let active = true;
    void saveApplication(JSON.parse(persistedJSON) as PersistedApplication).then((saved) => {
      if (active) setStorageMessage(saved ? undefined : '保存できませんでした。この起動中はそのまま遊べます。');
    });
    return () => { active = false; };
  }, [persistedJSON, state.hydrated, storageWritable]);

  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reducedMotion) => {
      if (!state.settings.reducedMotionOverridden) {
        dispatch({ type: 'UPDATE_SETTINGS', settings: { ...state.settings, reducedMotion } });
      }
    });
    return () => subscription.remove();
  }, [state.settings]);

  const navigateHome = () => { selectionRevision.current += 1; setReplayPending(false); dispatch({ type: 'NAVIGATE', screen: 'welcome' }); };
  const selectStage = (id: StageId, replay = false) => {
    const selectionLease = chapterLease, revision = ++selectionRevision.current;
    const choose = () => { if (!isFirstPersonSessionCurrent(selectionLease) || selectionRevision.current !== revision) return; setReplayPending(replay); dispatch({ type: 'PLAY', chapterId: id, sessionId: String(Date.now()) }); };
    if (replay) Alert.alert('このステージをもう一度遊ぶ', (STAGES.find(stage => stage.id === id)?.title ?? 'この章') + 'の今回の進行を、新しい周回で置き換えます。過去の脱出・発見、他の章と設定は残ります。', [
      { text: 'キャンセル', style: 'cancel', onPress: () => { if (selectionRevision.current === revision) selectionRevision.current += 1; } }, { text: 'もう一度遊ぶ', onPress: choose },
    ]); else choose();
  };
  const beginCalibration = () =>
    dispatch({ type: 'START_CALIBRATION', seed: Date.now() >>> 0, startedAt: new Date().toISOString() });
  const selectedCheckpoint = state.selectedChapterId === 'shadow-theatre-v1' ? theatreCheckpoint : state.selectedChapterId === 'uncanny-vault-v1' ? vaultCheckpoint : state.selectedChapterId === 'perception-gallery-v1' ? galleryCheckpoint : simpleRuns[state.selectedChapterId]?.checkpoint ?? checkpoint;
  const launchChapter = async (entry: CheckpointState, newRun: boolean, restart = false) => {
    const lease = beginFirstPersonSession();
    let next = entry;
    const vault = state.selectedChapterId === 'uncanny-vault-v1';
    const theatre = state.selectedChapterId === 'shadow-theatre-v1';
    const simple=simpleRuns[state.selectedChapterId];
    if (newRun && theatre) {
      next = createTheatreCheckpoint(createTheatreRuntime(undefined, undefined, Math.floor(Math.random() * 0x100000000)));
      setTheatreState(previous => ({ ...previous, started: true })); setTheatreCheckpoint(next);
    } else if (newRun && vault) {
      next = createVaultCheckpoint(createVaultRuntime(undefined, undefined, Math.floor(Math.random() * 0x100000000)));
      setVaultStarted(true); setVaultCheckpoint(next);
    } else if (newRun && simple) {
      const module=stageModule(state.selectedChapterId)!;
      next=module.checkpoint(module.create());
      setSimpleRuns(previous=>({...previous,[state.selectedChapterId]:{...previous[state.selectedChapterId]!,checkpoint:next,started:true}}));
    } else if (newRun) {
      // A run chooses its stimulus once. Failed writes retain this in-memory
      // checkpoint too, so leaving, retrying or returning never rerolls it.
      next = createCheckpoint(createGalleryRuntime(undefined, undefined, Math.floor(Math.random() * 0x100000000)));
      setGalleryStarted(true);
      setGalleryCheckpoint(next);
    }
    if (state.selectedChapterId === 'perception-gallery-v1' && (newRun || galleryNeedsCommit)) {
      const saved = await saveGalleryCheckpoint(next, lease);
      if (!isFirstPersonSessionCurrent(lease)) return;
      setHasGallerySave(saved);
      setGalleryNeedsCommit(!saved);
      setGalleryMessage(saved ? undefined : '章の進行を保存できませんでした。この起動中は同じ展示で続けられます。');
    }
    if (vault && (newRun || vaultNeedsCommit)) {
      const saved = await saveVaultCheckpoint(next, lease);
      if (!isFirstPersonSessionCurrent(lease)) return;
      setHasVaultSave(saved); setVaultNeedsCommit(!saved);
      setVaultMessage(saved ? undefined : '収蔵庫の進行を保存できませんでした。この起動中は同じ状態で続けられます。');
    }
    if (theatre && (newRun || theatreState.needsCommit)) {
      const saved = await saveTheatreCheckpoint(next, lease);
      if (!isFirstPersonSessionCurrent(lease)) return;
      setTheatreState(previous => ({ ...previous, hasSave: saved, needsCommit: !saved, message: saved ? undefined : '映写室の進行を保存できませんでした。この起動中は同じ状態で続けられます。' }));
    }
    if(simple&&(newRun||simple.needsCommit)){
      const saved=await saveModuleStageCheckpoint(next,lease);
      if(!isFirstPersonSessionCurrent(lease))return;
      setSimpleRuns(previous=>({...previous,[state.selectedChapterId]:{...previous[state.selectedChapterId]!,checkpoint:next,hasSave:saved,needsCommit:!saved,message:saved?undefined:'章の進行を保存できませんでした。この起動中は同じ状態で続けられます。'}}));
    }
    setCompletedAtEntry(!restart && next.progress.cleared);
    setChapterLease(lease);
    dispatch({ type: 'BEGIN_JOURNEY', chapterId: state.selectedChapterId });
  };
  const beginChapter = async () => {
    if (replayPending) { await restartChapter(); return; }
    if (resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    await launchChapter(selectedCheckpoint, state.selectedChapterId === 'shadow-theatre-v1' ? !theatreState.started && !theatreState.blocked : state.selectedChapterId === 'uncanny-vault-v1' ? !vaultStarted && !vaultBlocked : state.selectedChapterId === 'perception-gallery-v1' ? !galleryStarted && !galleryBlocked : !!simpleRuns[state.selectedChapterId]&&!simpleRuns[state.selectedChapterId]!.started&&!simpleRuns[state.selectedChapterId]!.blocked);
    resetInFlight.current = false;
    setResetting(false);
  };
  const restartChapter = async () => {
    if (resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    const vault = state.selectedChapterId === 'uncanny-vault-v1';
    const gallery = state.selectedChapterId === 'perception-gallery-v1';
    const theatre = state.selectedChapterId === 'shadow-theatre-v1';
    const simple=!!simpleRuns[state.selectedChapterId];
    const next = theatre ? createTheatreCheckpoint(createTheatreRuntime(undefined, undefined, Math.floor(Math.random() * 0x100000000))) : vault ? createVaultCheckpoint(createVaultRuntime(undefined, undefined, Math.floor(Math.random() * 0x100000000))) : gallery ? createCheckpoint(createGalleryRuntime(undefined, undefined, Math.floor(Math.random() * 0x100000000))) : simple ? stageModule(state.selectedChapterId)!.checkpoint(stageModule(state.selectedChapterId)!.create()) : createCheckpoint(createInitialRuntime());
    const removed = await (theatre ? resetTheatreChapter(next) : vault ? resetVaultChapter(next) : gallery ? resetGalleryChapter(next) : simple ? resetModuleStage(state.selectedChapterId,next) : resetFirstPersonChapter());
    if (removed) {
      setReplayPending(false);
      setJournal(previous => mergeStageHistory(previous, [selectedCheckpoint]));
      if (theatre) {
        setTheatreCheckpoint(next); setTheatreState({ started: true, hasSave: true, needsCommit: false, blocked: false, message: undefined });
      } else if (vault) {
        setVaultCheckpoint(next); setHasVaultSave(true); setVaultStarted(true);
        setVaultNeedsCommit(false); setVaultBlocked(false); setVaultMessage(undefined);
      } else if (gallery) {
        setGalleryCheckpoint(next);
        setHasGallerySave(true); setGalleryStarted(true); setGalleryNeedsCommit(false); setGalleryBlocked(false); setGalleryMessage(undefined);
      } else if(simple){
        setSimpleRuns(previous=>({...previous,[state.selectedChapterId]:{checkpoint:next,started:true,hasSave:true,needsCommit:false,blocked:false}}));
      } else {
        setCheckpoint(next); setHasLegacySave(false);
        setFirstPersonMessage(undefined);
      }
      // The chapter reset already wrote this exact new-run seed atomically.
      setCompletedAtEntry(false);
      setChapterLease(beginFirstPersonSession());
      dispatch({ type: 'BEGIN_JOURNEY', chapterId: state.selectedChapterId });
    } else {
      if (theatre) setTheatreState(previous => ({ ...previous, message: '章をリセットできませんでした。保存データを保持しています。' }));
      else if(simple)setSimpleRuns(previous=>({...previous,[state.selectedChapterId]:{...previous[state.selectedChapterId]!,message:'章をリセットできませんでした。保存データを保持しています。'}}));
      else (vault ? setVaultMessage : gallery ? setGalleryMessage : setFirstPersonMessage)('章をリセットできませんでした。保存データを保持しています。');
      navigateHome();
    }
    resetInFlight.current = false;
    setResetting(false);
  };

  const nextChapter = () => state.selectedChapterId === 'perception-gallery-v1' ? selectStage('uncanny-vault-v1', vaultCheckpoint.progress.cleared) : selectStage('shadow-theatre-v1', theatreCheckpoint.progress.cleared);
  const confirmReplay = () => selectStage(state.selectedChapterId, true);

  const reset = async () => {
    if (resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    setStorageWritable(false);
    const removed = await resetAllApplicationStorage();
    if (!removed) {
      setStorageMessage('保存データを削除できませんでした。この起動中の変更は保存されません。設定画面からもう一度お試しください。');
      resetInFlight.current = false;
      setResetting(false);
      return;
    }
    let systemReducedMotion = false;
    try {
      systemReducedMotion = await AccessibilityInfo.isReduceMotionEnabled();
    } catch {
      // Reset does not depend on the platform preference being available.
    }
    setStorageWritable(true);
    setJournal(emptyJournal()); setJournalMessage(undefined); setReplayPending(false); setLegacyBlocked(false);
    setStorageMessage(undefined);
    setFirstPersonMessage(undefined);
    setGalleryMessage(undefined); setGalleryBlocked(false); setHasGallerySave(false); setHasLegacySave(false);
    setGalleryStarted(false); setGalleryNeedsCommit(false);
    setVaultMessage(undefined); setVaultBlocked(false); setHasVaultSave(false); setVaultStarted(false); setVaultNeedsCommit(false);
    setVaultCheckpoint(createVaultCheckpoint(createVaultRuntime()));
    setTheatreCheckpoint(createTheatreCheckpoint(createTheatreRuntime()));
    setTheatreState({ started: false, needsCommit: false, hasSave: false, blocked: false, message: undefined });
    setSimpleRuns(initialSimpleRuns());
    setGalleryCheckpoint(createCheckpoint(createGalleryRuntime()));
    setControls({ ...DEFAULT_FIRST_PERSON_CONTROLS });
    setOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING });
    setOnboardingWritable(true);
    setCheckpoint(createCheckpoint(createInitialRuntime()));
    setChapterLease(beginFirstPersonSession());
    dispatch({ type: 'RESET', defaults: createDefaultApplication(systemReducedMotion) });
    resetInFlight.current = false;
    setResetting(false);
  };

  let screen;
  if (!state.hydrated || resetting) {
    screen = <View style={styles.loading} accessibilityLabel="読み込み中"><ActivityIndicator color={UI_COLORS.text} /></View>;
  } else if (state.screen === 'quickSetup' && state.quickSetupSession) {
    const session = state.quickSetupSession;
    screen = (
      <QuickSetupScreen
        key={session.id} session={session}
        onResponse={(index, answer) => dispatch({
          type: 'ADD_QUICK_RESPONSE', sessionId: session.id, index, answer, respondedAt: new Date().toISOString(),
        })}
        onSkip={() => dispatch({ type: 'SKIP_QUICK_SETUP', completedAt: new Date().toISOString() })}
        onExit={navigateHome}
      />
    );
  } else if (state.screen === 'playInstructions') {
    screen = <PlayInstructionsScreen chapterId={state.selectedChapterId} controls={controls} reducedMotion={state.settings.reducedMotion} horrorIntensity={state.settings.horrorIntensity ?? 'standard'} onHorrorChange={(horrorIntensity) => dispatch({ type: 'UPDATE_SETTINGS', settings: { ...state.settings, horrorIntensity } })} onStart={() => void beginChapter()} onSettings={() => { setSettingsReturn('playInstructions'); dispatch({ type: 'NAVIGATE', screen: 'settings' }); }} onBack={navigateHome} />;
  } else if (state.screen === 'firstPersonResult' && state.firstPersonSummary) {
    screen = <FirstPersonResultScreen summary={state.firstPersonSummary} onNewGallery={() => dispatch({ type: 'PLAY', chapterId: 'perception-gallery-v1' })} onNextChapter={nextChapter} onReplay={confirmReplay} onHome={navigateHome} onNotes={() => { setChapterLease(beginFirstPersonSession()); dispatch({ type: 'NAVIGATE', screen: 'galleryNotes' }); }} />;
  } else if (state.screen === 'firstPerson' || state.screen === 'galleryNotes' || (state.screen === 'firstPersonLab' && __DEV__)) {
    const lab = state.screen === 'firstPersonLab', reviewOnly = state.screen === 'galleryNotes';
    // Every callback captures this mounted run's lease; an old save/completion cannot adopt a new run.
    const lease = chapterLease;
    screen = !lab && !reviewOnly && completedAtEntry ? (
      <FirstPersonResultScreen
        summary={chapterCompletionSummary(selectedCheckpoint.chapterId, selectedCheckpoint.progress)}
        onNewGallery={() => dispatch({ type: 'PLAY', chapterId: 'perception-gallery-v1' })} onNextChapter={nextChapter}
        onReplay={confirmReplay} onHome={navigateHome}
        onNotes={() => { setChapterLease(beginFirstPersonSession()); dispatch({ type: 'NAVIGATE', screen: 'galleryNotes' }); }}
      />
    ) : (
      <NativeFirstPersonGate
        key={`${lab ? 'lab' : state.selectedChapterId}-${lease}`} scene={lab ? 'lab' : 'chapter'} chapterId={lab ? 'returnless-entrance' : state.selectedChapterId}
        reviewOnly={reviewOnly} settings={state.settings} controls={controls} {...(!lab ? { checkpoint: selectedCheckpoint } : {})}
        onboarding={onboarding}
        onOnboardingChange={(next) => {
          if (lab || !isFirstPersonSessionCurrent(lease)) return;
          setOnboarding((previous) => isFirstPersonSessionCurrent(lease) ? {
            schemaVersion: 1,
            controlChoiceAcknowledged: previous.controlChoiceAcknowledged || next.controlChoiceAcknowledged,
            tutorialCompleted: previous.tutorialCompleted || next.tutorialCompleted,
          } : previous);
          if (onboardingWritable) void saveFirstPersonOnboarding(next, lease).then((saved) => {
            if (!saved && isFirstPersonSessionCurrent(lease)) setFirstPersonMessage('操作の案内を保存できませんでした。この起動中は続けられます。');
          });
        }}
        preferredColor={state.activeSetupSource === 'quick' ? state.quickSetupResult?.provisionalColor ?? 'neutral' : state.calibrationProfile?.preferredForegroundColor ?? state.quickSetupResult?.provisionalColor ?? 'neutral'}
        onSettingsChange={(settings) => { if (isFirstPersonSessionCurrent(lease)) dispatch({ type: 'UPDATE_SETTINGS', settings }); }}
        onControlsChange={(next) => {
          if (!isFirstPersonSessionCurrent(lease)) return;
          setControls(next);
          void saveFirstPersonControls(next, lease).then((saved) => {
            if (!saved && isFirstPersonSessionCurrent(lease)) setFirstPersonMessage('操作設定を保存できませんでした。この起動中は変更した設定で遊べます。');
          });
        }}
        onValidatedEntry={(entry) => {
          if (entryRoute.current?.screen !== 'firstPerson' || entryRoute.current.lease !== lease || entryRoute.current.chapterId !== entry.chapterId) return;
          if (lab || reviewOnly || !isFirstPersonSessionCurrent(lease) || entry.chapterId !== state.selectedChapterId || entry.progress.cleared) return;
          const blocked = state.selectedChapterId === 'shadow-theatre-v1' ? theatreState.blocked : state.selectedChapterId === 'uncanny-vault-v1' ? vaultBlocked : state.selectedChapterId === 'perception-gallery-v1' ? galleryBlocked : simpleRuns[state.selectedChapterId]?.blocked??legacyBlocked;
          if (blocked) return; // A read-only trial cannot become a resumable run.
          if (entry.chapterId === 'returnless-entrance' && !hasLegacySave) {
            void saveFirstPersonCheckpoint(entry, lease).then(saved => { if (saved && isFirstPersonSessionCurrent(lease)) setHasLegacySave(true); });
          }
          setJournal(previous => mergeStageHistory(previous, [entry], state.selectedChapterId));
          void recordStageEntry(entry, lease, state.selectedChapterId).then(saved => {
            if (!saved && isFirstPersonSessionCurrent(lease)) setJournalMessage('最後に入ったステージを保存できませんでした。この起動中は続けられます。');
          });
        }}
        onCheckpoint={(next) => {
          if (lab || reviewOnly || !isFirstPersonSessionCurrent(lease) || next.chapterId !== state.selectedChapterId) return;
          const theatre = state.selectedChapterId === 'shadow-theatre-v1', vault = state.selectedChapterId === 'uncanny-vault-v1', gallery = state.selectedChapterId === 'perception-gallery-v1';
          const simple=!!simpleRuns[state.selectedChapterId];
          if (theatre) setTheatreCheckpoint(next); else if (vault) setVaultCheckpoint(next); else if (gallery) setGalleryCheckpoint(next); else if(simple)setSimpleRuns(previous=>({...previous,[state.selectedChapterId]:{...previous[state.selectedChapterId]!,checkpoint:next}})); else setCheckpoint(next);
          if (!(theatre ? theatreState.blocked : vault ? vaultBlocked : gallery ? galleryBlocked : simple ? simpleRuns[state.selectedChapterId]!.blocked : legacyBlocked)) {
            setJournal(previous => mergeStageHistory(previous, [next]));
            void recordStageHistory([next], lease).then(saved => { if (!saved && isFirstPersonSessionCurrent(lease)) setJournalMessage('発見や脱出の履歴を保存できませんでした。現在の進行は保持しています。'); });
          }
          void (theatre ? saveTheatreCheckpoint(next, lease) : vault ? saveVaultCheckpoint(next, lease) : gallery ? saveGalleryCheckpoint(next, lease) : simple ? saveModuleStageCheckpoint(next,lease) : saveFirstPersonCheckpoint(next, lease)).then((saved) => {
            if (!isFirstPersonSessionCurrent(lease)) return;
            if (saved) { if (theatre) setTheatreState(previous => ({ ...previous, hasSave: true })); else if (vault) setHasVaultSave(true); else if (gallery) setHasGallerySave(true); else if(simple)setSimpleRuns(previous=>({...previous,[state.selectedChapterId]:{...previous[state.selectedChapterId]!,hasSave:true}})); else setHasLegacySave(true); }
            else if (theatre) setTheatreState(previous => ({ ...previous, message: '章の進行を保存できませんでした。この起動中はそのまま遊べます。' }));
            else if(simple)setSimpleRuns(previous=>({...previous,[state.selectedChapterId]:{...previous[state.selectedChapterId]!,message:'章の進行を保存できませんでした。この起動中はそのまま遊べます。'}}));
            else (vault ? setVaultMessage : gallery ? setGalleryMessage : setFirstPersonMessage)('章の進行を保存できませんでした。この起動中はそのまま遊べます。');
          });
        }}
        onComplete={(summary) => {
          if (!lab && !reviewOnly && isFirstPersonSessionCurrent(lease)) dispatch({ type: 'COMPLETE_CHAPTER', summary, journeyRun: state.journeyRun });
        }}
        onRestart={() => { if (!isFirstPersonSessionCurrent(lease)) return; if (lab) setChapterLease(beginFirstPersonSession()); else void restartChapter(); }}
        onExit={() => { if (!isFirstPersonSessionCurrent(lease)) return; if (reviewOnly) dispatch({ type: 'NAVIGATE', screen: state.firstPersonSummary ? 'firstPersonResult' : 'firstPerson' }); else navigateHome(); }}
      />
    );
  } else if (state.screen === 'illusionMaze') {
    screen = (
      <IllusionMazeScreen
        key={`${state.journeyRun}-${state.stageIndex}`}
        levelIndex={state.stageIndex}
        settings={state.settings}
        preferredColor={state.activeSetupSource === 'quick' ? state.quickSetupResult?.provisionalColor ?? 'neutral' : state.calibrationProfile?.preferredForegroundColor ?? state.quickSetupResult?.provisionalColor ?? 'neutral'}
        onSettingsChange={(settings) => dispatch({ type: 'UPDATE_SETTINGS', settings })}
        onComplete={(summary) => dispatch({ type: 'COMPLETE_STAGE', summary, journeyRun: state.journeyRun })}
        onExit={navigateHome}
      />
    );
  } else if (state.screen === 'journeyResult') {
    screen = <JourneyResultScreen summaries={state.journeySummaries} onReplay={() => dispatch({ type: 'BEGIN_LEGACY_JOURNEY' })} onHome={navigateHome} />;
  } else if (state.screen === 'calibrationInstructions') {
    screen = <CalibrationInstructionsScreen onStart={beginCalibration} onBack={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  } else if (state.screen === 'calibration' && state.calibrationSession) {
    screen = <CalibrationScreen session={state.calibrationSession} onResponse={(response) => dispatch({ type: 'ADD_CALIBRATION_RESPONSE', response })} onExit={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  } else if (state.screen === 'calibrationResult' && state.calibrationProfile) {
    screen = <CalibrationResultScreen profile={state.calibrationProfile} onMaze={() => dispatch({ type: 'PLAY' })} onRecalibrate={() => dispatch({ type: 'NAVIGATE', screen: 'calibrationInstructions' })} onHome={navigateHome} />;
  } else if (state.screen === 'settings') {
    screen = (
      <SettingsScreen
        settings={state.settings}
        controls={controls}
        onControlsChange={(next) => { const lease = chapterLease; if (!isFirstPersonSessionCurrent(lease)) return; setControls(next); void saveFirstPersonControls(next, lease).then(saved => { if (!saved && isFirstPersonSessionCurrent(lease)) setFirstPersonMessage('操作設定を保存できませんでした。この起動中は変更した設定で遊べます。'); }); }}
        onChange={(settings) => dispatch({ type: 'UPDATE_SETTINGS', settings })}
        onQuickSetup={() => dispatch({ type: 'START_QUICK_SETUP', sessionId: String(Date.now()) })}
        onRecalibrate={() => dispatch({ type: 'NAVIGATE', screen: 'calibrationInstructions' })}
        onReset={() => void reset()}
        currentChapterName={STAGES.find(stage=>stage.id===state.selectedChapterId)?.title??'帰り道のない入口'}
        onResetChapter={() => void restartChapter()}
        onBack={() => dispatch({ type: 'NAVIGATE', screen: settingsReturn })}
        backLabel={settingsReturn === 'playInstructions' ? '入場前の準備へ戻る' : 'ホームへ戻る'}
        {...(__DEV__ ? {
          onDeveloperLab: () => dispatch({ type: 'NAVIGATE', screen: 'developerLab' }),
          onLegacyMaze: () => dispatch({ type: 'NAVIGATE', screen: 'microMaze' }),
          onLegacyJourney: () => dispatch({ type: 'BEGIN_LEGACY_JOURNEY' }),
          onFirstPersonLab: () => { setChapterLease(beginFirstPersonSession()); dispatch({ type: 'NAVIGATE', screen: 'firstPersonLab' }); },
        } : {})}
      />
    );
  } else if (state.screen === 'developerLab' && __DEV__) {
    screen = (
      <DeveloperLabScreen
        parameters={state.developerLab ?? DEFAULT_LAB_PARAMETERS}
        {...(state.calibrationSession ? { session: state.calibrationSession } : {})}
        onChange={(parameters) => dispatch({ type: 'UPDATE_LAB', parameters })}
        onEnvironmentChange={(environment) => {
          dispatch({ type: 'UPDATE_LAB', parameters: { ...(state.developerLab ?? DEFAULT_LAB_PARAMETERS), environment } });
          dispatch({ type: 'UPDATE_ENVIRONMENT', environment });
        }}
        onBack={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}
      />
    );
  } else if (state.screen === 'microMaze' && __DEV__) {
    screen = <MicroMazeScreen {...(state.calibrationProfile ? { profile: state.calibrationProfile } : {})} settings={state.settings} onComplete={(score) => dispatch({ type: 'FINISH_MAZE', score })} onExit={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  } else if (state.screen === 'stageResult' && state.latestMazeScore && __DEV__) {
    screen = <StageResultScreen score={state.latestMazeScore} bestScore={state.bestMazeScore} {...(state.calibrationProfile ? { profile: state.calibrationProfile } : {})} settings={state.settings} onRetry={() => dispatch({ type: 'NAVIGATE', screen: 'microMaze' })} onHome={navigateHome} />;
  } else {
    const entries = [
      { id: 'perception-gallery-v1' as const, checkpoint: galleryCheckpoint, saved: hasGallerySave || galleryStarted, blocked: galleryBlocked },
      { id: 'uncanny-vault-v1' as const, checkpoint: vaultCheckpoint, saved: hasVaultSave || vaultStarted, blocked: vaultBlocked },
      { id: 'shadow-theatre-v1' as const, checkpoint: theatreCheckpoint, saved: theatreState.hasSave || theatreState.started, blocked: theatreState.blocked },
      { id: 'returnless-entrance' as const, checkpoint, saved: hasLegacySave, blocked: legacyBlocked },
      ...simpleVisible.map(stage=>({id:stage.id,checkpoint:simpleRuns[stage.id]?.checkpoint??stageModule(stage.id)!.checkpoint(stageModule(stage.id)!.create()),saved:!!simpleRuns[stage.id]?.hasSave||!!simpleRuns[stage.id]?.started,blocked:!!simpleRuns[stage.id]?.blocked})),
    ];
    const cards: StageCardState[] = entries.map(entry => ({ id: entry.id,
      current: entry.blocked ? 'blocked' : entry.checkpoint.progress.cleared ? 'cleared' : entry.saved ? 'exploring' : 'new',
      history: journal.history[entry.id] ?? { everCleared: false, discoveries: [] } }));
    const lastResume = resumableStage(journal, cards);
    screen = <StageSelectScreen cards={cards} {...(lastResume ? { lastResume } : {})} onSelect={selectStage} onSettings={() => { setSettingsReturn('welcome'); dispatch({ type: 'NAVIGATE', screen: 'settings' }); }} />;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.application}>
        {screen}
        {journalMessage ? <Text accessibilityRole="alert" style={styles.notice}>{journalMessage}</Text> : null}
        {storageMessage ? <Text accessibilityRole="alert" style={styles.notice}>{storageMessage}</Text> : null}
        {theatreState.message ? <Text accessibilityRole="alert" style={styles.notice}>{theatreState.message}</Text> : null}
        {vaultMessage ? <Text accessibilityRole="alert" style={styles.notice}>{vaultMessage}</Text> : null}
        {galleryMessage ? <Text accessibilityRole="alert" style={styles.notice}>{galleryMessage}</Text> : null}
        {firstPersonMessage ? <Text accessibilityRole="alert" style={styles.notice}>{firstPersonMessage}</Text> : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  application: { flex: 1, backgroundColor: UI_COLORS.background },
  loading: { alignItems: 'center', backgroundColor: UI_COLORS.background, flex: 1, justifyContent: 'center' },
  notice: { backgroundColor: UI_COLORS.panel, color: UI_COLORS.text, fontSize: 14, padding: 12 },
});
