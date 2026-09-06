import { useState } from 'react';
import { MaterialCredits } from './DiscoveryNotebook';
import { Alert } from 'react-native';
import { getGalleryAudioAvailability, normalizeAudioPreferences } from '../audio';

import { ActionButton, Body, ChoiceRow, Heading, Panel, Screen, SectionTitle, SettingSwitch } from '../components/Layout';
import type { AppSettings, EffectStrength } from '../types/application';
import { PALETTE_IDS, PALETTE_LABELS } from '../domain/emblem/color';

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
  onFirstPersonLab,
  currentChapterName,
  onResetChapter,
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onRecalibrate: () => void;
  onReset: () => void;
  onBack: () => void;
  onQuickSetup: () => void;
  onDeveloperLab?: () => void;
  onLegacyMaze?: () => void;
  onLegacyJourney?: () => void;
  onFirstPersonLab?: () => void;
  currentChapterName?: string;
  onResetChapter?: () => void;
}) {
  const [credits, setCredits] = useState(false);
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
          label="ハプティクス"
          description="仕掛けを解いたときなどに、軽い触覚で知らせます。"
          value={settings.haptics}
          onValueChange={(value) => set('haptics', value)}
        />
      </Panel>
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
        <SettingSwitch label="サウンド" description="無音でも、すべての仕掛けを解けます。端末の消音設定を尊重します。" value={audio.enabled} onValueChange={(enabled) => set('audio', { ...audio, enabled })} />
        <SettingSwitch label="演出音" description="短い音の錯覚を使います。控えめな怖さでは再生しません。" value={audio.illusionEnabled ?? true} onValueChange={(illusionEnabled) => set('audio', { ...audio, illusionEnabled })} />
        {audioAvailability === 'missing-native' ? <Body muted>音の再生には新しいDevelopment Buildが必要です。今の開発版でも、音なしで探索を続けられます。</Body> : null}
        {audioAvailability === 'unavailable' ? <Body muted>音を再生できません。音なしで探索を続けられます。</Body> : null}
        {(['musicVolume', 'effectsVolume'] as const).map((field) => <Panel key={field}>
          <Body>{field === 'musicVolume' ? '環境音' : '効果音'} {Math.round(audio[field] * 100)}%</Body>
          <ChoiceRow>{[0, 0.25, 0.5, 0.75, 1].map((volume) => <ActionButton key={volume}
            label={`${field === 'musicVolume' ? '環境音' : '効果音'} ${Math.round(volume * 100)}%${audio[field] === volume ? '（選択中）' : ''}`}
            onPress={() => set('audio', { ...audio, [field]: volume })} />)}</ChoiceRow>
        </Panel>)}
      </Panel>
      <SectionTitle>色の展示と旧章の表示</SectionTitle>
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
      <ActionButton label="簡単に調整する（3問）" onPress={onQuickSetup} />
      <ActionButton label="詳しく調整する" onPress={onRecalibrate} />
      <Body muted>調整は表示のための目安です。見え方を診断するものではありません。</Body>
      {onResetChapter ? <ActionButton label={`${currentChapterName ?? '現在の章'}だけを最初から`}
        onPress={() => Alert.alert('この章だけを最初から', `${currentChapterName ?? '現在の章'}の進行をリセットします。他の章、表示と音の設定、調整結果は残ります。`, [
          { text: 'キャンセル', style: 'cancel' }, { text: 'この章だけリセット', style: 'destructive', onPress: onResetChapter },
        ])} variant="danger" /> : null}
      <ActionButton
        label="保存データをリセット"
        onPress={() =>
          Alert.alert('保存データをリセット', '簡易・詳細調整、設定、旧スコア、旧章と展示室の進行、音の設定を端末から削除します。', [
            { text: 'キャンセル', style: 'cancel' },
            { text: 'リセット', style: 'destructive', onPress: onReset },
          ])
        }
        variant="danger"
      />
      <ActionButton label={credits ? "クレジットを閉じる" : "出典と素材クレジット"} onPress={() => setCredits(!credits)} />
      {credits ? <MaterialCredits /> : null}
      <ActionButton label="ホームへ戻る" onPress={onBack} />
      {onDeveloperLab ? <ActionButton label="開発者ラボ" onPress={onDeveloperLab} /> : null}
      {onFirstPersonLab ? <ActionButton label="一人称ランタイム検証" onPress={onFirstPersonLab} /> : null}
      {onLegacyJourney ? <ActionButton label="旧2.5D迷宮（開発用）" onPress={onLegacyJourney} /> : null}
      {onLegacyMaze ? <ActionButton label="旧レール検証（開発用）" onPress={onLegacyMaze} /> : null}
    </Screen>
  );
}
