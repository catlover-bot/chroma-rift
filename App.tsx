import { ChapterMusic } from './src/screens/ChapterMusic';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { appReducer, initialAppState, persistedFromState } from './src/app/state';
import { createGalleryRuntime } from './src/domain/gallery';
import { createTheatreRuntime, createTheatreCheckpoint } from './src/domain/theatre';
import { createVaultRuntime } from './src/domain/vault/runtime';
import { createVaultCheckpoint } from './src/domain/vault/checkpoint';
import { chapterCompletionSummary } from './src/app/chapterSummary';
import { APP_VERSION } from './src/app/version';
import { CHAPTER_ONE, campaignArea, nextCampaignArea, type CampaignAreaId } from './src/domain/campaign/definition';
import { createCampaignAreaEntry, createCampaignReplayEntry } from './src/domain/campaign/areaEntry';
import { proposeLegacyCampaignImport, type LegacyImportProposal } from './src/domain/campaign/migration';
import { completeCampaignArea, createChapterOneSession, recordCampaignBeatPresented, recordCampaignCheckpoint, recordCampaignNoiseObservation, recordCampaignReplayDiscoveries, recordCampaignSafeEntry, verifiedAreaCheckpoint, type ChapterOneSession } from './src/domain/campaign/session';
import { CHAPTER_ONE_BEATS } from './src/domain/campaign/story';
import type { CampaignDiscoveryHistory } from './src/domain/campaign/discoveries';
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
import { ChapterOneHomeScreen } from './src/screens/ChapterOneHomeScreen';
import { ChapterOneEndingScreen } from './src/screens/ChapterOneEndingScreen';
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
  loadChapterOneStorage, saveChapterOneSession, adoptLegacyChapterOne, restartChapterOne,
  saveFirstPersonCheckpoint, saveFirstPersonControls, saveFirstPersonOnboarding,
} from './src/storage/firstPersonStorage';
import { loadLegacyCampaignRaw } from './src/storage/chapterOneLegacy';
import { UI_COLORS } from './src/theme/ui';
import { ActionButton, Screen } from './src/components/Layout';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_FIRST_PERSON_ONBOARDING, DEFAULT_LAB_PARAMETERS, type FirstPersonControls, type FirstPersonOnboarding, type PersistedApplication } from './src/types/application';

const simpleVisible=(STAGE_DEFINITIONS as readonly {id:string;playerVisible:boolean;renderKind:string}[])
  .filter(stage=>stage.playerVisible&&stage.renderKind==='simple').map(stage=>({id:stage.id as PlayableStageId}));
type SimpleRun={checkpoint:CheckpointState;started:boolean;hasSave:boolean;needsCommit:boolean;blocked:boolean;message?:string|undefined};
type CampaignIntent = 'new' | 'continue' | 'import';
type CampaignRun = { areaId: CampaignAreaId; checkpoint: CheckpointState; lease: number; token: number; replay: boolean };
type PendingCampaignTransition = { candidate: ChapterOneSession; fromArea: CampaignAreaId; lease: number; token: number;
  status: 'saving' | 'failed' | 'story'; sessionOnly?: boolean };
type PendingCampaignCheckpointSave = { lease: number; runId: string; status: 'saving' | 'failed' };
function nextTransitionStory(pending: PendingCampaignTransition) {
  // The final answer and departure are presented by the ending screen after
  // the outdoor completion has already been committed.
  if (pending.fromArea === 'chapter-1-area-05') return undefined;
  return CHAPTER_ONE_BEATS.find(beat => beat.area === pending.fromArea &&
    pending.candidate.storyFired.includes(beat.id) && !pending.candidate.storyPresented.includes(beat.id));
}
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
  const [settingsReturn, setSettingsReturn] = useState<'welcome' | 'playInstructions' | 'legacyStages'>('welcome');
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
  const [campaign, setCampaign] = useState<ChapterOneSession | undefined>();
  const campaignRef = useRef<ChapterOneSession | undefined>(undefined);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [campaignBlocked, setCampaignBlocked] = useState<string | undefined>();
  const [campaignMessage, setCampaignMessage] = useState<string | undefined>();
  const [campaignMigration, setCampaignMigration] = useState<LegacyImportProposal | undefined>();
  const [campaignIntent, setCampaignIntent] = useState<CampaignIntent | undefined>();
  const [campaignAreas, setCampaignAreas] = useState(false);
  const [campaignDiscoveries, setCampaignDiscoveries] = useState(false);
  const [campaignRun, setCampaignRun] = useState<CampaignRun | undefined>();
  const campaignRunToken = useRef(0);
  const campaignActive = useRef(false);
  const campaignCleared = useRef<CheckpointState | undefined>(undefined);
  const [campaignTransition, setCampaignTransition] = useState<PendingCampaignTransition | undefined>();
  const campaignTransitionRef = useRef<PendingCampaignTransition | undefined>(undefined);
  const [campaignCheckpointSave, setCampaignCheckpointSave] = useState<PendingCampaignCheckpointSave | undefined>();
  const campaignCheckpointSaveRef = useRef<PendingCampaignCheckpointSave | undefined>(undefined);
  const [campaignSessionOnly, setCampaignSessionOnly] = useState(false);
  const campaignSessionOnlyRef = useRef(false);
  const campaignSaveTail = useRef<Promise<void>>(Promise.resolve());
  const campaignCompletionSave = useRef<{ candidate: ChapterOneSession; lease: number; result: Promise<boolean> } | undefined>(undefined);

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
      const [loaded, chapter, gallery, vault, theatre, history, simple, chapterOne] = await Promise.all([
        loadApplication(systemReducedMotion), loadFirstPersonStorage(), loadGalleryStorage(), loadVaultStorage(),
        loadTheatreStorage(), loadStageJournal(), Promise.all(simpleVisible.map(stage=>loadModuleStageStorage(stage.id))),
        loadChapterOneStorage(),
      ]);
      let migration: LegacyImportProposal | undefined, migrationError: string | undefined;
      if (chapterOne.status === 'empty') {
        try {
          migration = proposeLegacyCampaignImport(await loadLegacyCampaignRaw(), `legacy-${Date.now()}`, APP_VERSION);
        } catch { migrationError = '以前の記録を確認できませんでした。原文を保持しています。'; }
      }
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
      const loadedCampaign = chapterOne.status === 'loaded' ? chapterOne.session : undefined;
      campaignRef.current = loadedCampaign;
      setCampaign(loadedCampaign);
      setCampaignLoading(false);
      setCampaignBlocked(chapterOne.status === 'blocked' ? chapterOne.message : undefined);
      setCampaignMessage(migrationError);
      setCampaignMigration(migration);
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

  const navigateHome = () => {
    selectionRevision.current += 1;
    campaignActive.current = false;
    campaignRunToken.current += 1;
    setCampaignRun(undefined);
    setCampaignIntent(undefined);
    setReplayPending(false);
    dispatch({ type: 'NAVIGATE', screen: 'welcome' });
  };
  const queueCampaignSave = (session: ChapterOneSession, lease: number) => {
    // The outdoor frame and the end of its visual tail share one immutable
    // completion. Reuse that write; storage must still reject stale revisions.
    const completion = campaignCompletionSave.current;
    if (session.campaignCompleted && completion?.candidate === session && completion.lease === lease)
      return completion.result;
    const operation = saveChapterOneSession(session, lease);
    campaignSaveTail.current = operation.then(() => undefined, () => undefined);
    if (session.campaignCompleted) {
      const pending = { candidate: session, lease, result: operation };
      campaignCompletionSave.current = pending;
      const forgetFailure = () => { if (campaignCompletionSave.current === pending) campaignCompletionSave.current = undefined; };
      void operation.then(saved => { if (!saved) forgetFailure(); }, forgetFailure);
    }
    return operation;
  };
  const showCampaignCheckpointSave = (pending: PendingCampaignCheckpointSave | undefined) => {
    campaignCheckpointSaveRef.current = pending;
    setCampaignCheckpointSave(pending);
  };
  const recordCampaignSaveResult = (saved: boolean, candidate: ChapterOneSession, lease: number) => {
    if (!isFirstPersonSessionCurrent(lease)) return;
    if (saved) {
      if (campaignCheckpointSaveRef.current?.runId === candidate.runId)
        showCampaignCheckpointSave(undefined);
      setCampaignMessage(undefined);
    } else if (!campaignSessionOnlyRef.current) {
      showCampaignCheckpointSave({ lease, runId: candidate.runId, status: 'failed' });
      setCampaignMessage('進行を保存できませんでした。再試行するか、この起動中だけ続けられます。');
    }
  };
  const retryCampaignCheckpointSave = async (pending: PendingCampaignCheckpointSave) => {
    if (campaignCheckpointSaveRef.current?.runId !== pending.runId ||
      !isFirstPersonSessionCurrent(pending.lease)) return;
    showCampaignCheckpointSave({ ...pending, status: 'saving' });
    await campaignSaveTail.current;
    if (campaignCheckpointSaveRef.current?.runId !== pending.runId) return;
    const latest = campaignRef.current;
    if (!latest || latest.runId !== pending.runId) return;
    const saved = await queueCampaignSave(latest, pending.lease);
    if (campaignCheckpointSaveRef.current?.runId !== pending.runId ||
      !isFirstPersonSessionCurrent(pending.lease)) return;
    if (saved) { showCampaignCheckpointSave(undefined); setCampaignMessage(undefined); }
    else {
      showCampaignCheckpointSave({ ...pending, status: 'failed' });
      setCampaignMessage('進行を保存できませんでした。再試行するか、この起動中だけ続けられます。');
    }
  };
  const applyCampaignStory = (candidate: ChapterOneSession, lease: number) => {
    if (candidate === campaignRef.current) return;
    campaignRef.current = candidate;
    setCampaign(candidate);
    if (campaignSessionOnlyRef.current) return;
    void queueCampaignSave(candidate, lease).then(saved => recordCampaignSaveResult(saved, candidate, lease));
  };
  const prepareCampaign = (intent: CampaignIntent) => {
    setCampaignIntent(intent);
    setCampaignAreas(false);
    setCampaignDiscoveries(false);
    const target = intent === 'continue' ? campaignRef.current : intent === 'import' && campaignMigration?.status === 'ready' ? campaignMigration.session : undefined;
    // PLAY owns the existing three-question setup. The campaign's actual area
    // is passed to its instructions and Stage Kit host separately.
    dispatch({ type: 'PLAY', chapterId: 'perception-gallery-v1', sessionId: `chapter-one-${Date.now()}` });
    if (target?.campaignCompleted) dispatch({ type: 'NAVIGATE', screen: 'campaignEnding' });
  };
  const confirmNewCampaign = () => {
    const begin = () => prepareCampaign('new');
    if (!campaignRef.current && !campaignBlocked && (!campaignMigration || campaignMigration.status === 'none')) { begin(); return; }
    Alert.alert('第一章を最初から', '現在の第一章の進行を新しい周回に置き換えます。旧ステージの原文と設定は保持します。', [
      { text: 'キャンセル', style: 'cancel' }, { text: '最初から始める', style: 'destructive', onPress: begin },
    ]);
  };
  const enterCampaignRun = (session: ChapterOneSession, lease: number, replay = false, checkpoint = session.checkpoint) => {
    campaignCleared.current = undefined;
    campaignActive.current = true;
    const token = ++campaignRunToken.current;
    setCampaignRun({ areaId: session.currentArea, checkpoint, lease, token, replay });
    dispatch({ type: 'NAVIGATE', screen: 'campaign' });
  };
  const beginCampaignIntent = async () => {
    const intent = campaignIntent;
    if (!intent || resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    await campaignSaveTail.current;
    const lease = beginFirstPersonSession();
    const previous = campaignRef.current;
    const candidate = intent === 'new'
      ? createChapterOneSession(`chapter-one-${Date.now()}`, APP_VERSION, (previous?.resetGeneration ?? -1) + 1)
      : intent === 'import' && campaignMigration?.status === 'ready' ? campaignMigration.session : previous;
    const saved = !!candidate && (intent === 'new' ? await restartChapterOne(candidate, lease)
      : intent === 'import' ? await adoptLegacyChapterOne(candidate, lease) : true);
    if (!candidate || !saved || !isFirstPersonSessionCurrent(lease)) {
      setCampaignMessage('第一章の記録を準備できませんでした。原文は保持しています。もう一度お試しください。');
      setResetting(false); resetInFlight.current = false; return;
    }
    campaignRef.current = candidate;
    setCampaign(candidate);
    setCampaignIntent(undefined);
    showCampaignCheckpointSave(undefined);
    setCampaignMigration(undefined);
    setCampaignBlocked(undefined);
    setCampaignMessage(undefined);
    campaignSessionOnlyRef.current = false;
    setCampaignSessionOnly(false);
    setResetting(false); resetInFlight.current = false;
    if (candidate.campaignCompleted) dispatch({ type: 'NAVIGATE', screen: 'campaignEnding' });
    else enterCampaignRun(candidate, lease);
  };
  const startCampaignReplay = async (areaId: CampaignAreaId) => {
    if (resetInFlight.current) return;
    const area = campaignArea(areaId);
    const legacyReached = !!area && (((area.stageId === 'perception-gallery-v1' || area.stageId === 'uncanny-vault-v1' || area.stageId === 'shadow-theatre-v1') && journal.history[area.stageId]?.everCleared) ||
      (areaId === 'chapter-1-area-01' && hasGallerySave) ||
      (areaId === 'chapter-1-area-02' && hasVaultSave) ||
      (areaId === 'chapter-1-area-03' && theatreState.hasSave));
    const entry = createCampaignReplayEntry(areaId, campaignRef.current, legacyReached);
    if (!entry) { setCampaignMessage('このエリアの練習入口を開けませんでした。'); return; }
    await campaignSaveTail.current;
    const lease = beginFirstPersonSession();
    campaignCleared.current = undefined;
    campaignActive.current = true;
    const token = ++campaignRunToken.current;
    setCampaignMessage(undefined);
    setCampaignRun({ areaId, checkpoint: entry, lease, token, replay: true });
    dispatch({ type: 'NAVIGATE', screen: 'campaign' });
  };
  const applyCampaignTransition = (candidate: ChapterOneSession, token: number, saved: boolean) => {
    campaignRef.current = candidate;
    setCampaign(candidate);
    showCampaignCheckpointSave(undefined);
    campaignTransitionRef.current = undefined;
    setCampaignTransition(undefined);
    campaignCleared.current = undefined;
    if (!saved) { campaignSessionOnlyRef.current = true; setCampaignSessionOnly(true); }
    else setCampaignMessage(undefined);
    if (!campaignActive.current || campaignRunToken.current !== token) return;
    if (candidate.campaignCompleted) {
      campaignActive.current = false;
      campaignRunToken.current += 1;
      setCampaignRun(undefined);
      dispatch({ type: 'NAVIGATE', screen: 'campaignEnding' });
      return;
    }
    const lease = beginFirstPersonSession();
    enterCampaignRun(candidate, lease);
  };
  const presentOrApplyCampaignTransition = (pending: PendingCampaignTransition, saved: boolean) => {
    if (campaignTransitionRef.current?.token !== pending.token) return;
    if (nextTransitionStory(pending)) {
      const showing = { ...pending, status: 'story' as const, sessionOnly: !saved || !!pending.sessionOnly };
      campaignTransitionRef.current = showing;
      setCampaignTransition(showing);
      return;
    }
    applyCampaignTransition(pending.candidate, pending.token, saved);
  };
  const commitCampaignTransition = async (pending: PendingCampaignTransition) => {
    const active = campaignTransitionRef.current;
    if (active?.token !== pending.token || active.status !== pending.status || active.candidate !== pending.candidate) return;
    const saving = { ...pending, status: 'saving' as const };
    campaignTransitionRef.current = saving;
    setCampaignTransition(saving);
    await campaignSaveTail.current;
    const saved = await queueCampaignSave(pending.candidate, pending.lease);
    if (campaignTransitionRef.current?.token !== pending.token || campaignTransitionRef.current.candidate !== pending.candidate ||
      campaignTransitionRef.current.status !== 'saving') return;
    if (saved) presentOrApplyCampaignTransition(pending, true);
    else {
      const failed = { ...pending, status: 'failed' as const };
      campaignTransitionRef.current = failed;
      setCampaignTransition(failed);
      setCampaignMessage('エリアの移動を保存できませんでした。再試行するか、この起動中だけ続けられます。');
    }
  };
  const acknowledgeTransitionStory = (pending: PendingCampaignTransition) => {
    if (pending.status !== 'story' || campaignTransitionRef.current?.token !== pending.token ||
      campaignTransitionRef.current.status !== 'story' || campaignTransitionRef.current.candidate !== pending.candidate) return;
    const beat = nextTransitionStory(pending);
    if (!beat) return;
    const next = { ...pending, candidate: recordCampaignBeatPresented(pending.candidate, beat.id) };
    if (pending.sessionOnly) presentOrApplyCampaignTransition(next, false);
    else {
      const saving = { ...next, status: 'saving' as const };
      campaignTransitionRef.current = saving;
      setCampaignTransition(saving);
      void commitCampaignTransition(saving);
    }
  };
  const replayableCampaignAreas = CHAPTER_ONE.areas.filter(area =>
    campaign?.currentArea === area.id || campaign?.completedAreas.includes(area.id) ||
    ((area.stageId === 'perception-gallery-v1' || area.stageId === 'uncanny-vault-v1' || area.stageId === 'shadow-theatre-v1') && !!journal.history[area.stageId]?.everCleared) ||
    (area.id === 'chapter-1-area-01' && hasGallerySave) ||
    (area.id === 'chapter-1-area-02' && hasVaultSave) ||
    (area.id === 'chapter-1-area-03' && theatreState.hasSave),
  ).map(area => area.id);
  const observedDiscoveries = CHAPTER_ONE.areas.reduce<CampaignDiscoveryHistory>((history, area) => {
    const current = campaign?.discoveryHistory[area.id] ?? [];
    const legacy = area.stageId === 'perception-gallery-v1' || area.stageId === 'uncanny-vault-v1' || area.stageId === 'shadow-theatre-v1'
      ? journal.history[area.stageId]?.discoveries ?? [] : [];
    const union = [...new Set([...current, ...legacy])];
    if (union.length) history[area.id] = union;
    return history;
  }, {});
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
    campaignActive.current = false; campaignRunToken.current += 1;
    campaignRef.current = undefined; setCampaign(undefined); setCampaignLoading(false);
    setCampaignBlocked(undefined); setCampaignMessage(undefined); setCampaignMigration(undefined);
    setCampaignRun(undefined); campaignTransitionRef.current = undefined; setCampaignTransition(undefined);
    showCampaignCheckpointSave(undefined);
    setCampaignDiscoveries(false); setCampaignAreas(false);
    campaignSessionOnlyRef.current = false; setCampaignSessionOnly(false);
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
    const intentSession = campaignIntent === 'continue' ? campaign : campaignIntent === 'import' && campaignMigration?.status === 'ready' ? campaignMigration.session : undefined;
    const area = intentSession ? campaignArea(intentSession.currentArea) : CHAPTER_ONE.areas[0];
    screen = <PlayInstructionsScreen chapterId={campaignIntent ? (area ?? CHAPTER_ONE.areas[0]).stageId : state.selectedChapterId} campaignMode={!!campaignIntent} controls={controls} reducedMotion={state.settings.reducedMotion} horrorIntensity={state.settings.horrorIntensity ?? 'standard'} onHorrorChange={(horrorIntensity) => dispatch({ type: 'UPDATE_SETTINGS', settings: { ...state.settings, horrorIntensity } })} onStart={() => void (campaignIntent ? beginCampaignIntent() : beginChapter())} onSettings={() => { setSettingsReturn('playInstructions'); dispatch({ type: 'NAVIGATE', screen: 'settings' }); }} onBack={navigateHome} />;
  } else if (state.screen === 'campaignEnding' && campaign?.campaignCompleted) {
    const showProcedure = campaign.storyFired.includes('containment-bell') && !campaign.storyPresented.includes('containment-bell');
    screen = <ChapterOneEndingScreen onHome={navigateHome} showProcedure={showProcedure}
      onShown={() => {
        const previous = campaignRef.current;
        if (previous?.campaignCompleted) {
          const withProcedure = showProcedure ? recordCampaignBeatPresented(previous, 'containment-bell') : previous;
          const shown = recordCampaignBeatPresented(recordCampaignBeatPresented(withProcedure, 'attendance-identified'), 'outdoor-exit');
          if (shown !== previous) applyCampaignStory(shown, beginFirstPersonSession());
        }
      }}
      onAreas={() => { setCampaignDiscoveries(false); setCampaignAreas(true); dispatch({ type: 'NAVIGATE', screen: 'welcome' }); }}
      onDiscoveries={() => { setCampaignAreas(false); setCampaignDiscoveries(true); dispatch({ type: 'NAVIGATE', screen: 'welcome' }); }} />;
  } else if (state.screen === 'campaignReplayResult' && campaignRun?.replay) {
    const area = campaignArea(campaignRun.areaId);
    screen = <Screen><Text style={styles.replayTitle}>{area?.title}を振り返った</Text>
      <Text style={styles.replayBody}>練習の結果は第一章の現在位置を変えません。</Text>
      <ActionButton label="エリア一覧へ" variant="primary" onPress={() => { setCampaignAreas(true); navigateHome(); }} />
    </Screen>;
  } else if (state.screen === 'campaign' && campaignRun) {
    const run = campaignRun, area = campaignArea(run.areaId);
    const current = () => campaignActive.current && campaignRunToken.current === run.token &&
      isFirstPersonSessionCurrent(run.lease) && !campaignTransitionRef.current;
    screen = !area ? <Screen><Text style={styles.replayBody}>エリアを読み込めませんでした。</Text><ActionButton label="ホームへ戻る" onPress={navigateHome}/></Screen> :
      <NativeFirstPersonGate
        key={`campaign-${run.areaId}-${run.token}`} scene="chapter" chapterId={area.stageId}
        pauseForCampaignSave={!!campaignCheckpointSave || !!campaignTransition}
        storyBeat={!run.replay ? CHAPTER_ONE_BEATS.find(beat => campaign?.storyFired.includes(beat.id) && !campaign.storyPresented.includes(beat.id)) : undefined}
        onStoryPresented={beat => {
          if (!current() || run.replay) return;
          const previous = campaignRef.current;
          if (previous) applyCampaignStory(recordCampaignBeatPresented(previous, beat), run.lease);
        }}
        onCampaignNoiseObserved={() => {
          if (!current() || run.replay) return;
          const previous = campaignRef.current;
          if (previous) applyCampaignStory(recordCampaignNoiseObservation(previous, run.areaId), run.lease);
        }}
        checkpoint={run.checkpoint} settings={state.settings} controls={controls} onboarding={onboarding}
        preferredColor={state.activeSetupSource === 'quick' ? state.quickSetupResult?.provisionalColor ?? 'neutral' : state.calibrationProfile?.preferredForegroundColor ?? state.quickSetupResult?.provisionalColor ?? 'neutral'}
        onSettingsChange={settings => { if (current()) dispatch({ type: 'UPDATE_SETTINGS', settings }); }}
        onControlsChange={next => {
          if (!current()) return;
          setControls(next);
          void saveFirstPersonControls(next, run.lease).then(saved => {
            if (!saved && current()) setCampaignMessage('操作設定を保存できませんでした。この起動中は変更した設定で遊べます。');
          });
        }}
        onOnboardingChange={next => {
          if (!current()) return;
          setOnboarding(previous => ({ schemaVersion: 1,
            controlChoiceAcknowledged: previous.controlChoiceAcknowledged || next.controlChoiceAcknowledged,
            tutorialCompleted: previous.tutorialCompleted || next.tutorialCompleted }));
          if (onboardingWritable) void saveFirstPersonOnboarding(next, run.lease);
        }}
        onValidatedEntry={() => {
          if (!current() || run.replay) return;
          const previous = campaignRef.current;
          if (previous) applyCampaignStory(recordCampaignSafeEntry(previous, run.areaId), run.lease);
        }}
        onCheckpoint={checkpoint => {
          if (!current() || checkpoint.chapterId !== area.stageId) return;
          if (run.replay) {
            const verified = verifiedAreaCheckpoint(run.areaId, checkpoint);
            if (!verified) { setCampaignMessage('練習の進行を確認できませんでした。現在の記録を保持しています。'); return; }
            const previous = campaignRef.current;
            const update = previous && recordCampaignReplayDiscoveries(previous, run.areaId, verified);
            if (update?.accepted) {
              if (update.changed) {
                campaignRef.current = update.session;
                setCampaign(update.session);
                if (!campaignSessionOnlyRef.current) void queueCampaignSave(update.session, run.lease).then(saved => {
                  recordCampaignSaveResult(saved, update.session, run.lease);
                });
              }
            } else if (area.stageId === 'perception-gallery-v1' || area.stageId === 'uncanny-vault-v1' || area.stageId === 'shadow-theatre-v1') {
              setJournal(previousJournal => mergeStageHistory(previousJournal, [verified]));
              void recordStageHistory([verified], run.lease).then(saved => {
                if (current() && !saved) setJournalMessage('発見の記録を保存できませんでした。');
              });
            }
            if (verified.progress.cleared) campaignCleared.current = verified;
            return;
          }
          if (checkpoint.progress.cleared) {
            campaignCleared.current = checkpoint;
            // Save the outdoor crossing on its first accepted presentation.
            // The four-second courtyard tail and credits never delay durability.
            const before = campaignRef.current;
            if (run.areaId === 'chapter-1-area-05' && before && !before.campaignCompleted) {
              const completion = completeCampaignArea(before, run.areaId, checkpoint);
              if (completion.accepted) {
                campaignRef.current = completion.session;
                setCampaign(completion.session);
                if (!campaignSessionOnlyRef.current) void queueCampaignSave(completion.session, run.lease).then(saved => {
                  recordCampaignSaveResult(saved, completion.session, run.lease);
                });
              }
            }
            return;
          }
          const previous = campaignRef.current;
          if (!previous) return;
          const update = recordCampaignCheckpoint(previous, run.areaId, checkpoint);
          if (!update.accepted) { setCampaignMessage('エリアの進行を確認できませんでした。現在の記録を保持しています。'); return; }
          if (!update.changed) return;
          campaignRef.current = update.session;
          setCampaign(update.session);
          if (campaignSessionOnlyRef.current) return;
          void queueCampaignSave(update.session, run.lease).then(saved => {
            recordCampaignSaveResult(saved, update.session, run.lease);
          });
        }}
        onComplete={summary => {
          if (!current() || summary.chapterId !== area.stageId || !campaignCleared.current) return;
          if (run.replay) {
            campaignActive.current = false;
            campaignRunToken.current += 1;
            dispatch({ type: 'NAVIGATE', screen: 'campaignReplayResult' });
            return;
          }
          const previous = campaignRef.current, cleared = campaignCleared.current;
          if (!previous) return;
          const next = nextCampaignArea(run.areaId);
          const entry = next ? createCampaignAreaEntry(next.id, previous, cleared) : undefined;
          const transition = previous.campaignCompleted && run.areaId === 'chapter-1-area-05'
            ? { accepted: true as const, session: previous } : completeCampaignArea(previous, run.areaId, cleared, entry);
          if (!transition.accepted) { setCampaignMessage('次のエリアへの経路を確認できませんでした。現在の記録を保持しています。'); return; }
          const pending: PendingCampaignTransition = { candidate: transition.session, fromArea: run.areaId,
            lease: run.lease, token: run.token, status: 'saving' };
          campaignTransitionRef.current = pending;
          if (campaignSessionOnlyRef.current) {
            presentOrApplyCampaignTransition({ ...pending, sessionOnly: true }, false);
            return;
          }
          setCampaignTransition(pending);
          void commitCampaignTransition(pending);
        }}
        onRestart={() => { if (!current()) return; if (run.replay) void startCampaignReplay(run.areaId); else { navigateHome(); confirmNewCampaign(); } }}
        onExit={() => { if (current()) navigateHome(); }}
      />;
  } else if (__DEV__ && state.screen === 'firstPersonResult' && state.firstPersonSummary) {
    screen = <FirstPersonResultScreen summary={state.firstPersonSummary} onNewGallery={() => dispatch({ type: 'PLAY', chapterId: 'perception-gallery-v1' })} onNextChapter={nextChapter} onReplay={confirmReplay} onHome={navigateHome} onNotes={() => { setChapterLease(beginFirstPersonSession()); dispatch({ type: 'NAVIGATE', screen: 'galleryNotes' }); }} />;
  } else if (__DEV__ && (state.screen === 'firstPerson' || state.screen === 'galleryNotes' || state.screen === 'firstPersonLab')) {
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
  } else if (__DEV__ && state.screen === 'illusionMaze') {
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
  } else if (__DEV__ && state.screen === 'journeyResult') {
    screen = <JourneyResultScreen summaries={state.journeySummaries} onReplay={() => dispatch({ type: 'BEGIN_LEGACY_JOURNEY' })} onHome={navigateHome} />;
  } else if (state.screen === 'calibrationInstructions') {
    screen = <CalibrationInstructionsScreen onStart={beginCalibration} onBack={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  } else if (state.screen === 'calibration' && state.calibrationSession) {
    screen = <CalibrationScreen session={state.calibrationSession} onResponse={(response) => dispatch({ type: 'ADD_CALIBRATION_RESPONSE', response })} onExit={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  } else if (state.screen === 'calibrationResult' && state.calibrationProfile) {
    screen = <CalibrationResultScreen profile={state.calibrationProfile} onMaze={() => __DEV__ ? dispatch({ type: 'PLAY' }) : navigateHome()} primaryLabel={__DEV__ ? '迷路を試す' : '第一章のホームへ'} onRecalibrate={() => dispatch({ type: 'NAVIGATE', screen: 'calibrationInstructions' })} onHome={navigateHome} />;
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
        currentChapterName={campaignIntent || settingsReturn === 'welcome' ? '第一章「最後の退館者」' : STAGES.find(stage=>stage.id===state.selectedChapterId)?.title??'帰り道のない入口'}
        onResetChapter={() => { if (campaignIntent || settingsReturn === 'welcome') prepareCampaign('new'); else void restartChapter(); }}
        resetChapterPrompt={campaignIntent || settingsReturn === 'welcome' ? {
          body: '第一章を最初から始める準備へ進みます。新しい周回で入場すると、第一章の現在の進行・発見・物語の提示記録を置き換えます。旧ステージの原文、他の章、表示と音の設定、調整結果は残ります。',
          confirmLabel: '入場の準備へ',
        } : undefined}
        onBack={() => dispatch({ type: 'NAVIGATE', screen: settingsReturn })}
        backLabel={settingsReturn === 'playInstructions' ? '入場前の準備へ戻る' : settingsReturn === 'legacyStages' ? '旧ステージ一覧へ戻る' : 'ホームへ戻る'}
        {...(__DEV__ ? {
          onDeveloperLab: () => dispatch({ type: 'NAVIGATE', screen: 'developerLab' }),
          onLegacyMaze: () => dispatch({ type: 'NAVIGATE', screen: 'microMaze' }),
          onLegacyJourney: () => dispatch({ type: 'BEGIN_LEGACY_JOURNEY' }),
          onLegacyStages: () => dispatch({ type: 'NAVIGATE', screen: 'legacyStages' }),
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
  } else if (state.screen === 'legacyStages' && __DEV__) {
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
    screen = <StageSelectScreen cards={cards} {...(lastResume ? { lastResume } : {})} onSelect={selectStage} onSettings={() => { setSettingsReturn('legacyStages'); dispatch({ type: 'NAVIGATE', screen: 'settings' }); }} />;
  } else {
    screen = <ChapterOneHomeScreen
      session={campaign} migration={campaignMigration} loading={campaignLoading} blocked={campaignBlocked}
      message={campaignMessage} replayable={replayableCampaignAreas} showAreas={campaignAreas}
      showDiscoveries={campaignDiscoveries} discoveries={observedDiscoveries}
      onContinue={() => { if (campaign?.campaignCompleted) dispatch({ type: 'NAVIGATE', screen: 'campaignEnding' }); else prepareCampaign('continue'); }}
      onNew={confirmNewCampaign}
      onImport={() => { if (campaignMigration?.status === 'ready') prepareCampaign('import'); }}
      onAreas={() => { setCampaignDiscoveries(false); setCampaignAreas(true); }}
      onDiscoveries={() => { setCampaignAreas(false); setCampaignDiscoveries(true); }}
      onHome={() => { setCampaignAreas(false); setCampaignDiscoveries(false); }}
      onReplay={areaId => { void startCampaignReplay(areaId); }}
      onEnding={() => { if (campaign?.campaignCompleted) dispatch({ type: 'NAVIGATE', screen: 'campaignEnding' }); }}
      onSettings={() => { setSettingsReturn('welcome'); dispatch({ type: 'NAVIGATE', screen: 'settings' }); }}
      {...(__DEV__ ? { onLegacyStages: () => dispatch({ type: 'NAVIGATE', screen: 'legacyStages' }) } : {})}
    />;
  }

  return (
    <SafeAreaProvider>
      {(state.screen === 'welcome' || state.screen === 'campaignEnding') && <ChapterMusic state={state.screen === 'campaignEnding' ? 'chapter_end' : 'title_theme'} preferences={state.settings.audio}/>}
      <View style={styles.application}>
        {screen}
        {journalMessage ? <Text accessibilityRole="alert" style={styles.notice}>{journalMessage}</Text> : null}
        {storageMessage ? <Text accessibilityRole="alert" style={styles.notice}>{storageMessage}</Text> : null}
        {theatreState.message ? <Text accessibilityRole="alert" style={styles.notice}>{theatreState.message}</Text> : null}
        {vaultMessage ? <Text accessibilityRole="alert" style={styles.notice}>{vaultMessage}</Text> : null}
        {galleryMessage ? <Text accessibilityRole="alert" style={styles.notice}>{galleryMessage}</Text> : null}
        {firstPersonMessage ? <Text accessibilityRole="alert" style={styles.notice}>{firstPersonMessage}</Text> : null}
        {campaignSessionOnly ? <Text accessibilityRole="alert" style={styles.notice}>この起動中だけ進行しています。終了すると最後に保存できた地点へ戻ります。</Text> : null}
        {campaignTransition ? <View style={styles.campaignOverlay} accessibilityViewIsModal>
          <Text style={styles.replayTitle}>{campaignTransition.status === 'saving' ? '次のエリアを保存しています…' :
            campaignTransition.status === 'story' ? '点検記録' : 'エリアの移動を保存できませんでした'}</Text>
          {campaignTransition.status === 'saving' ? <ActivityIndicator color={UI_COLORS.text}/> :
            campaignTransition.status === 'story' ? <>
              <Text style={styles.replayBody}>{nextTransitionStory(campaignTransition)?.text}</Text>
              <Text style={styles.replayBody}>{nextTransitionStory(campaignTransition)?.response}</Text>
              <ActionButton label="点検を続ける" variant="primary" onPress={() => acknowledgeTransitionStory(campaignTransition)}/>
            </> : <>
            <Text style={styles.replayBody}>再試行するか、この起動中だけ次へ進めます。</Text>
            <ActionButton label="保存を再試行" variant="primary" onPress={() => { const pending = campaignTransitionRef.current; if (pending) void commitCampaignTransition(pending); }}/>
            <ActionButton label="この起動中だけ続ける" onPress={() => {
              const pending = campaignTransitionRef.current;
              if (pending) {
                campaignSessionOnlyRef.current = true; setCampaignSessionOnly(true);
                presentOrApplyCampaignTransition({ ...pending, sessionOnly: true }, false);
              }
            }}/>
          </>}
        </View> : campaignCheckpointSave ? <View style={styles.campaignOverlay} accessibilityViewIsModal>
          <Text style={styles.replayTitle}>{campaignCheckpointSave.status === 'saving' ? '進行を保存しています…' : '進行を保存できませんでした'}</Text>
          {campaignCheckpointSave.status === 'saving' ? <ActivityIndicator color={UI_COLORS.text}/> : <>
            <Text style={styles.replayBody}>現在の進行はこの起動中に保持しています。保存を再試行できます。</Text>
            <ActionButton label="保存を再試行" variant="primary" onPress={() => void retryCampaignCheckpointSave(campaignCheckpointSave)}/>
            <ActionButton label="この起動中だけ続ける" onPress={() => {
              campaignSessionOnlyRef.current = true; setCampaignSessionOnly(true);
              showCampaignCheckpointSave(undefined); setCampaignMessage(undefined);
            }}/>
          </>}
        </View> : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  application: { flex: 1, backgroundColor: UI_COLORS.background },
  loading: { alignItems: 'center', backgroundColor: UI_COLORS.background, flex: 1, justifyContent: 'center' },
  notice: { backgroundColor: UI_COLORS.panel, color: UI_COLORS.text, fontSize: 14, padding: 12 },
  replayTitle: { color: UI_COLORS.text, fontSize: 23, fontWeight: '700', marginBottom: 16 },
  replayBody: { color: UI_COLORS.textMuted, fontSize: 16, lineHeight: 25, marginBottom: 20 },
  campaignOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, backgroundColor: UI_COLORS.background,
    justifyContent: 'center', padding: 26, gap: 14 },
});
