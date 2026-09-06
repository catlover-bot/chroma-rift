import { Alert } from 'react-native';

import { ActionButton, Body, ChoiceRow, Heading, Panel, Screen, SectionTitle, SettingSwitch } from '../components/Layout';
import type { AppSettings, EffectStrength } from '../types/application';

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
}) {
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
      <SectionTitle>色模様の強さ</SectionTitle>
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
      <ActionButton
        label="保存データをリセット"
        onPress={() =>
          Alert.alert('保存データをリセット', '簡易・詳細調整、設定、旧スコア、一人称の進行を端末から削除します。', [
            { text: 'キャンセル', style: 'cancel' },
            { text: 'リセット', style: 'destructive', onPress: onReset },
          ])
        }
        variant="danger"
      />
      <ActionButton label="ホームへ戻る" onPress={onBack} />
      {onDeveloperLab ? <ActionButton label="開発者ラボ" onPress={onDeveloperLab} /> : null}
      {onFirstPersonLab ? <ActionButton label="一人称ランタイム検証" onPress={onFirstPersonLab} /> : null}
      {onLegacyJourney ? <ActionButton label="旧2.5D迷宮（開発用）" onPress={onLegacyJourney} /> : null}
      {onLegacyMaze ? <ActionButton label="旧レール検証（開発用）" onPress={onLegacyMaze} /> : null}
    </Screen>
  );
}
