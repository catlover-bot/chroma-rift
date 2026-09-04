import { Alert } from 'react-native';

import { ActionButton, ChoiceRow, Heading, Panel, Screen, SectionTitle, SettingSwitch } from '../components/Layout';
import type { AppSettings, EffectStrength } from '../types/application';

export function SettingsScreen({
  settings,
  onChange,
  onRecalibrate,
  onReset,
  onBack,
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onRecalibrate: () => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const set = <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) =>
    onChange({ ...settings, [key]: value });

  return (
    <Screen>
      <Heading>設定</Heading>
      <Panel>
        <SettingSwitch
          label="Depth Assist"
          description="正解ルートに中立色の記号と太さの手がかりを加えます。得点は変わりません。"
          value={settings.depthAssist}
          onValueChange={(value) => set('depthAssist', value)}
        />
        <SettingSwitch
          label="動きを減らす"
          description="オーブ移動と装飾的な動きを最小限にします。"
          value={settings.reducedMotion}
          onValueChange={(value) =>
            onChange({ ...settings, reducedMotion: value, reducedMotionOverridden: true })
          }
        />
        <SettingSwitch
          label="ハプティクス"
          description="有効なルート選択時に軽い触覚フィードバックを使います。"
          value={settings.haptics}
          onValueChange={(value) => set('haptics', value)}
        />
      </Panel>
      <SectionTitle>エフェクトの強さ</SectionTitle>
      <ChoiceRow>
        {(['low', 'medium', 'high'] as const).map((strength) => (
          <ActionButton
            key={strength}
            label={`${strength === 'low' ? '弱い' : strength === 'medium' ? '普通' : '強い'}${settings.effectStrength === strength ? '（選択中）' : ''}`}
            onPress={() => set('effectStrength', strength as EffectStrength)}
          />
        ))}
      </ChoiceRow>
      <ActionButton label="キャリブレーションをやり直す" onPress={onRecalibrate} />
      <ActionButton
        label="保存データをリセット"
        onPress={() =>
          Alert.alert('保存データをリセット', '調整結果、設定、ベストスコアを端末から削除します。', [
            { text: 'キャンセル', style: 'cancel' },
            { text: 'リセット', style: 'destructive', onPress: onReset },
          ])
        }
        variant="danger"
      />
      <ActionButton label="ホームへ戻る" onPress={onBack} />
    </Screen>
  );
}
