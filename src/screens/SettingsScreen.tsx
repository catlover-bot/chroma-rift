import { APP_NAME, APP_NAME_READING } from '../app/brand';
import { useState } from 'react';
import { MaterialCredits } from './DiscoveryNotebook';
import { Alert } from 'react-native';
import { getGalleryAudioAvailability, normalizeAudioPreferences } from '../audio';

import { ActionButton, Body, ChoiceRow, Heading, Panel, Screen, SectionTitle, SettingSwitch } from '../components/Layout';
import type { AppSettings, EffectStrength, FirstPersonControls } from '../types/application';
import { PALETTE_IDS, PALETTE_LABELS } from '../domain/emblem/color';
import { APP_VERSION } from '../app/version';
import { PLAYER_TEXT } from '../app/playerText';
import { SupportInformation } from './SupportInformation';

export function SettingsScreen({
  settings,
  onChange,
  onRecalibrate,
  onReset,
  onBack,
  onQuickSetup,
  onDeveloperLab,
  onLegacyMaze,
  onLegacyJourney,
  onLegacyStages,
  onFirstPersonLab,
  currentChapterName,
  onResetChapter, resetChapterPrompt, controls, onControlsChange, backLabel = 'ホームへ戻る',
}: {
  controls?: FirstPersonControls;
  onControlsChange?: (controls: FirstPersonControls) => void;
  backLabel?: string;
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onRecalibrate: () => void;
  onReset: () => void;
  onBack: () => void;
  onQuickSetup: () => void;
  onDeveloperLab?: () => void;
  onLegacyMaze?: () => void;
  onLegacyJourney?: () => void;
  onLegacyStages?: () => void;
  onFirstPersonLab?: () => void;
  currentChapterName?: string;
  onResetChapter?: () => void;
  resetChapterPrompt?: { body: string; confirmLabel: string } | undefined;
}) {
  const [information, setInformation] = useState<'about' | 'credits' | 'privacy' | 'support'>();
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
  const showDeveloperTools = __DEV__ && information === 'support' && developerToolsOpen;
  const toggleInformation = (section: typeof information) => setInformation(current => current === section ? undefined : section);
  const audio = normalizeAudioPreferences(settings.audio);
  const audioAvailability = getGalleryAudioAvailability();
  const set = <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) =>
    onChange({ ...settings, [key]: value });

  return (
    <Screen>
      <Heading>設定</Heading>
      <Panel>
        <SettingSwitch
          label="補助表示"
          description="通れる床と観察の印を中立色で見つけやすくします。"
          value={settings.depthAssist}
          onValueChange={(value) => onChange({ ...settings, depthAssist: value, depthAssistOverridden: true })}
        />
        <SettingSwitch
          label="動きを減らす"
          description="飾りの動きを抑えます。ドラッグで歩く・見回す操作はそのまま使えます。"
          value={settings.reducedMotion}
          onValueChange={(value) =>
            onChange({ ...settings, reducedMotion: value, reducedMotionOverridden: true })
          }
        />
        <SettingSwitch
          label="振動"
          description="仕掛けを解いたときなどに、軽い振動で知らせます。"
          value={settings.haptics}
          onValueChange={(value) => set('haptics', value)}
        />
      </Panel>
      {controls && onControlsChange ? <Panel>
        <SectionTitle>操作</SectionTitle>
        <ChoiceRow>
          <ActionButton label="右手で見回す" variant={controls.handedness === 'right' ? 'primary' : 'secondary'} onPress={() => onControlsChange({ ...controls, handedness: 'right' })} />
          <ActionButton label="左手で見回す" variant={controls.handedness === 'left' ? 'primary' : 'secondary'} onPress={() => onControlsChange({ ...controls, handedness: 'left' })} />
        </ChoiceRow>
        <SettingSwitch label="簡単なボタン操作" description="ドラッグと同じ仕掛けを、個別の操作ボタンでも調整できます。" value={controls.movementMode === 'simple'} onValueChange={simple => onControlsChange({ ...controls, movementMode: simple ? 'simple' : 'standard' })} />
        <Body>視点の感度</Body>
        <ChoiceRow>{[0.6, 1, 1.5].map((sensitivity, index) => <ActionButton key={sensitivity} label={['ゆっくり', '標準', '速め'][index]!} variant={controls.sensitivity === sensitivity ? 'primary' : 'secondary'} onPress={() => onControlsChange({ ...controls, sensitivity })} />)}</ChoiceRow>
        <Body>上下の感度</Body><ChoiceRow>{[0.6, 1].map(verticalSensitivity => <ActionButton key={verticalSensitivity} label={verticalSensitivity === 1 ? '上下の感度：同じ' : '上下の感度：控えめ'} variant={(controls.verticalSensitivity ?? 1) === verticalSensitivity ? 'primary' : 'secondary'} onPress={() => onControlsChange({ ...controls, verticalSensitivity })} />)}</ChoiceRow>
      </Panel> : null}
      <SectionTitle>怖さ</SectionTitle>
      <Panel>
        <Body>標準は巡回と接近があります。控えめは気配を残し、追尾と接触によるやり直しをなくします。</Body>
        <ChoiceRow>
          <ActionButton label="標準の怖さ" variant={(settings.horrorIntensity ?? 'standard') === 'standard' ? 'primary' : 'secondary'} onPress={() => set('horrorIntensity', 'standard')} />
          <ActionButton label="控えめな怖さ" variant={settings.horrorIntensity === 'subdued' ? 'primary' : 'secondary'} onPress={() => set('horrorIntensity', 'subdued')} />
        </ChoiceRow>
        <Body muted>謎と出口条件は同じです。音や動きの設定は変えません。</Body>
      </Panel>
      <SectionTitle>音</SectionTitle>
      <Panel>
        <SettingSwitch label="音" description="無音でも、すべての仕掛けを解けます。端末の消音設定を尊重します。" value={audio.enabled} onValueChange={(enabled) => set('audio', { ...audio, enabled })} />
        <SettingSwitch label="演出音" description="短い音の錯覚を使います。控えめな怖さでは再生しません。" value={audio.illusionEnabled ?? true} onValueChange={(illusionEnabled) => set('audio', { ...audio, illusionEnabled })} />
        {audio.enabled && [audio.musicVolume, audio.environmentVolume, audio.effectsVolume].some(volume => (volume ?? 0) > 0) && audioAvailability !== 'available' ? <Body muted>{PLAYER_TEXT.audioUnavailable}</Body> : null}
        {(['musicVolume', 'environmentVolume', 'effectsVolume'] as const).map((field) => <Panel key={field}>
          <Body>{field === 'musicVolume' ? '音楽' : field === 'environmentVolume' ? '環境音' : '効果音'} {Math.round((audio[field] ?? 0) * 100)}%</Body>
          <ChoiceRow>{[0, 0.25, 0.5, 0.75, 1].map((volume) => <ActionButton key={volume}
            label={`${field === 'musicVolume' ? '音楽' : field === 'environmentVolume' ? '環境音' : '効果音'} ${Math.round(volume * 100)}%${audio[field] === volume ? '（選択中）' : ''}`}
            onPress={() => set('audio', { ...audio, [field]: volume })} />)}</ChoiceRow>
        </Panel>)}
      </Panel>
      <SectionTitle>色の展示</SectionTitle>
      <Body muted>見え方を比べて選べます。奥行きの強さに決まった順序はありません。</Body>
      <ChoiceRow>
        {PALETTE_IDS.map((palette) => (
          <ActionButton
            key={palette}
            label={`${PALETTE_LABELS[palette]}${(settings.emblemPalette ?? 'baseline') === palette ? '（選択中）' : ''}`}
            onPress={() => set('emblemPalette', palette)}
          />
        ))}
      </ChoiceRow>
      {showDeveloperTools && onLegacyMaze ? <>
        <SectionTitle>旧迷宮の色模様の強さ</SectionTitle>
        <ChoiceRow>
          {(['low', 'medium', 'high'] as const).map((strength) => (
            <ActionButton
              key={strength}
              label={`${strength === 'low' ? '弱い' : strength === 'medium' ? '普通' : '強い'}${settings.effectStrength === strength ? '（選択中）' : ''}`}
              onPress={() => set('effectStrength', strength as EffectStrength)}
            />
          ))}
        </ChoiceRow>
      </> : null}
      <ActionButton label="簡単に調整する（3問）" onPress={onQuickSetup} />
      <ActionButton label="詳しく調整する" onPress={onRecalibrate} />
      <Body muted>調整は表示のための目安です。見え方を診断するものではありません。</Body>
      {onResetChapter ? <ActionButton label={`${currentChapterName ?? '現在の章'}だけを最初から`}
        onPress={() => Alert.alert('この章だけを最初から', resetChapterPrompt?.body ?? `${currentChapterName ?? '現在の章'}の今回の進行をリセットします。過去のクリア履歴・発見記録と、他の章、表示と音の設定、調整結果は残ります。`, [
          { text: 'キャンセル', style: 'cancel' }, { text: resetChapterPrompt?.confirmLabel ?? 'この章だけリセット', style: 'destructive', onPress: onResetChapter },
        ])} variant="danger" /> : null}
      <ActionButton
        label="保存データをリセット"
        onPress={() =>
          Alert.alert('保存データをリセット', '第一章の本編進行、簡易・詳細調整、設定、以前のスコア、各エリアの記録、音の設定、発見履歴を端末から削除します。', [
            { text: 'キャンセル', style: 'cancel' },
            { text: 'リセット', style: 'destructive', onPress: onReset },
          ])
        }
        variant="danger"
      />
      <SectionTitle>アプリ情報</SectionTitle>
      <ActionButton label="このアプリについて" onPress={() => toggleInformation('about')} />
      {information === 'about' ? <Panel>
        <Body>{APP_NAME}（{APP_NAME_READING}）　バージョン {APP_VERSION}</Body>
        <Body>第一章「最後の退館者」は、閉館後の館内を5つのエリアで進み、巡回体を隔離して屋外へ出る物語です。</Body>
        <Body muted>第二章は今後のアップデートで追加予定です。</Body>
      </Panel> : null}
      <ActionButton label="出典と素材クレジット" onPress={() => toggleInformation('credits')} />
      {information === 'credits' ? <MaterialCredits /> : null}
      <ActionButton label="プライバシー" onPress={() => toggleInformation('privacy')} />
      {information === 'privacy' ? <Panel>
        <Body>プレイの進行、観察履歴、設定、表示の調整結果を端末内に保存します。この画面の「保存データをリセット」から削除できます。</Body>
        <Body>本編の操作にアカウント登録、位置情報、カメラ、マイクは使いません。</Body>
      </Panel> : null}
      <ActionButton label="サポート" onPress={() => toggleInformation('support')} />
      {information === 'support' ? <Panel>
        <Body>画面を表示できないときは、探索画面から「表示を再試行」を選べます。記録を保存できないときは、画面の案内に従ってもう一度お試しください。</Body>
        <SupportInformation />
        {__DEV__ && (onDeveloperLab || onFirstPersonLab || onLegacyJourney || onLegacyStages || onLegacyMaze) ? <ActionButton label={developerToolsOpen ? '開発用の道具を閉じる' : '開発用の道具'} onPress={() => setDeveloperToolsOpen(value => !value)} /> : null}
        {showDeveloperTools ? <>
          {onDeveloperLab ? <ActionButton label="開発者ラボ" onPress={onDeveloperLab} /> : null}
          {onFirstPersonLab ? <ActionButton label="一人称ランタイム検証" onPress={onFirstPersonLab} /> : null}
          {onLegacyJourney ? <ActionButton label="旧2.5D迷宮（開発用）" onPress={onLegacyJourney} /> : null}
          {onLegacyStages ? <ActionButton label="旧ステージ一覧（開発用）" onPress={onLegacyStages} /> : null}
          {onLegacyMaze ? <ActionButton label="旧レール検証（開発用）" onPress={onLegacyMaze} /> : null}
        </> : null}
      </Panel> : null}
      <ActionButton label={backLabel} onPress={onBack} />
    </Screen>
  );
}
