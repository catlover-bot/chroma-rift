import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ActionButton, Body, ChoiceRow, Heading, Panel, Screen, SectionTitle, SettingSwitch } from '../components/Layout';
import {
  DEFAULT_CALIBRATION_ENVIRONMENT,
  PATTERN_FAMILIES,
  type CalibrationEnvironment,
  type CalibrationSession,
  type CalibrationTrial,
  type PatternFamily,
} from '../domain/calibration/types';
import { CalibrationStimulus } from '../rendering/CalibrationStimulus';
import { UI_COLORS } from '../theme/ui';
import { DEFAULT_LAB_PARAMETERS, type DeveloperLabParameters } from '../types/application';

function OptionGroup<T extends string>({
  label,
  values,
  value,
  labels,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  labels?: Partial<Record<T, string>>;
  onChange: (value: T) => void;
}) {
  return (
    <>
      <SectionTitle>{label}</SectionTitle>
      <ChoiceRow>
        {values.map((option) => (
          <ActionButton
            key={option}
            label={`${labels?.[option] ?? option}${value === option ? '（選択中）' : ''}`}
            onPress={() => onChange(option)}
          />
        ))}
      </ChoiceRow>
    </>
  );
}

export function DeveloperLabScreen({
  parameters,
  session,
  onChange,
  onEnvironmentChange,
  onBack,
}: {
  parameters: DeveloperLabParameters;
  session?: CalibrationSession;
  onChange: (parameters: DeveloperLabParameters) => void;
  onEnvironmentChange: (environment: CalibrationEnvironment) => void;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const [showAll, setShowAll] = useState(false);
  const motionOffset = useSharedValue(0);
  const environment = session?.environment ?? parameters.environment ?? DEFAULT_CALIBRATION_ENVIRONMENT;
  const set = <Key extends keyof DeveloperLabParameters>(
    key: Key,
    value: DeveloperLabParameters[Key],
  ) => onChange({ ...parameters, [key]: value });
  const trial = (patternFamily: PatternFamily): CalibrationTrial => ({
    id: `lab-${patternFamily}`,
    patternFamily,
    background: parameters.background,
    colorRoleAssignment: parameters.colorRoleAssignment,
    rotation: parameters.rotation,
    mirrored: parameters.mirrored,
  });
  const families = showAll ? PATTERN_FAMILIES : [parameters.patternFamily];
  const stimulusParameters = useMemo(
    () => ({
      red: parameters.redColor,
      blue: parameters.blueColor,
      strokeWidth: parameters.strokeWidth,
      spacing: parameters.spacing,
      glow: parameters.mode === 'game' ? parameters.glow : 0,
    }),
    [parameters],
  );
  const motionStyle = useAnimatedStyle(() => ({ transform: [{ translateX: motionOffset.value }] }));

  useEffect(() => {
    cancelAnimation(motionOffset);
    if (parameters.mode === 'game' && parameters.motion > 0 && !parameters.reducedMotion) {
      motionOffset.set(withRepeat(
        withTiming(parameters.motion * 3, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ));
    } else {
      motionOffset.set(0);
    }
    return () => cancelAnimation(motionOffset);
  }, [motionOffset, parameters.mode, parameters.motion, parameters.reducedMotion]);

  const setEnvironment = <Key extends keyof CalibrationEnvironment>(
    key: Key,
    value: CalibrationEnvironment[Key],
  ) => onEnvironmentChange({ ...environment, [key]: value });

  return (
    <Screen>
      <Heading>開発者刺激ラボ</Heading>
      <Body muted>開発ビルドだけで表示されます。端末設定は自動取得せず、選択内容をローカルだけに保存します。</Body>
      <ChoiceRow>
        <ActionButton
          label={`Calibration-neutral mode${parameters.mode === 'calibration' ? '（選択中）' : ''}`}
          onPress={() => onChange({ ...parameters, mode: 'calibration', glow: 0, motion: 0 })}
        />
        <ActionButton
          label={`Game presentation mode${parameters.mode === 'game' ? '（選択中）' : ''}`}
          onPress={() => set('mode', 'game')}
        />
      </ChoiceRow>
      {families.map((family) => (
        <Animated.View
          key={family}
          style={[
            motionStyle,
            parameters.mode === 'game' && parameters.glow > 0
              ? {
                  shadowColor: '#FFFFFF',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: Math.min(0.3, parameters.glow * 0.08),
                  shadowRadius: parameters.glow * 4,
                }
              : undefined,
          ]}
        >
          <CalibrationStimulus
            trial={trial(family)}
            width={Math.min(width - 40, 430)}
            height={showAll ? 190 : 310}
            parameters={stimulusParameters}
          />
        </Animated.View>
      ))}
      <SettingSwitch
        label="3パターンをすべて表示"
        description="リング、交差レール、ドット場を並べます。"
        value={showAll}
        onValueChange={setShowAll}
      />
      <OptionGroup
        label="パターン"
        values={PATTERN_FAMILIES}
        value={parameters.patternFamily}
        labels={{ rings: 'リング', crossingRails: '交差レール', dotFields: 'ドット場' }}
        onChange={(value) => set('patternFamily', value)}
      />
      <OptionGroup
        label="背景"
        values={['dark', 'light'] as const}
        value={parameters.background}
        labels={{ dark: '暗い', light: '明るい' }}
        onChange={(value) => set('background', value)}
      />
      <OptionGroup
        label="赤プリセット"
        values={['#FF2A2A', '#FF4545'] as const}
        value={parameters.redColor as '#FF2A2A' | '#FF4545'}
        onChange={(value) => set('redColor', value)}
      />
      <OptionGroup
        label="青プリセット"
        values={['#006BFF', '#2484FF'] as const}
        value={parameters.blueColor as '#006BFF' | '#2484FF'}
        onChange={(value) => set('blueColor', value)}
      />
      <OptionGroup
        label="色の役割"
        values={['primaryRed', 'primaryBlue'] as const}
        value={parameters.colorRoleAssignment}
        labels={{ primaryRed: '主役が赤', primaryBlue: '主役が青' }}
        onChange={(value) => set('colorRoleAssignment', value)}
      />
      <SectionTitle>線幅・間隔</SectionTitle>
      <ChoiceRow>
        <ActionButton label="線を細く" onPress={() => set('strokeWidth', Math.max(2, parameters.strokeWidth - 1))} />
        <ActionButton label="線を太く" onPress={() => set('strokeWidth', Math.min(18, parameters.strokeWidth + 1))} />
        <ActionButton label="間隔を狭く" onPress={() => set('spacing', Math.max(12, parameters.spacing - 2))} />
        <ActionButton label="間隔を広く" onPress={() => set('spacing', Math.min(48, parameters.spacing + 2))} />
      </ChoiceRow>
      <OptionGroup
        label="回転"
        values={['0', '90', '180', '270'] as const}
        value={String(parameters.rotation) as '0' | '90' | '180' | '270'}
        onChange={(value) => set('rotation', Number(value) as 0 | 90 | 180 | 270)}
      />
      <SettingSwitch label="ミラー" description="配置を左右反転します。" value={parameters.mirrored} onValueChange={(value) => set('mirrored', value)} />
      <SettingSwitch label="動きを減らす" description="ラボ内のゲーム動作量を抑えます。" value={parameters.reducedMotion} onValueChange={(value) => set('reducedMotion', value)} />
      <SettingSwitch label="Depth Assist" description="ゲーム用の非色覚手がかりです。" value={parameters.depthAssist} onValueChange={(value) => set('depthAssist', value)} />
      <SectionTitle>ゲーム専用効果</SectionTitle>
      <ChoiceRow>
        <ActionButton label="グロー −" disabled={parameters.mode === 'calibration'} onPress={() => set('glow', Math.max(0, parameters.glow - 1))} />
        <ActionButton label="グロー ＋" disabled={parameters.mode === 'calibration'} onPress={() => set('glow', Math.min(3, parameters.glow + 1))} />
        <ActionButton label="動作量 −" disabled={parameters.mode === 'calibration'} onPress={() => set('motion', Math.max(0, parameters.motion - 1))} />
        <ActionButton label="動作量 ＋" disabled={parameters.mode === 'calibration'} onPress={() => set('motion', Math.min(3, parameters.motion + 1))} />
      </ChoiceRow>
      <Panel>
        <Text selectable style={styles.json}>{JSON.stringify(parameters, null, 2)}</Text>
      </Panel>
      <ActionButton label="現在のパラメータをJSONでコピー" onPress={() => void Clipboard.setStringAsync(JSON.stringify(parameters, null, 2))} />
      <ActionButton label="現在の調整セッションをJSONでコピー" onPress={() => void Clipboard.setStringAsync(JSON.stringify(session ?? null, null, 2))} />
      <ActionButton label="ベースラインに戻す" onPress={() => onChange({ ...DEFAULT_LAB_PARAMETERS })} />
      <SectionTitle>手動実験メモ</SectionTitle>
      <OptionGroup label="画面の明るさ" values={['low', 'medium', 'high', 'unknown'] as const} value={environment.brightness} onChange={(value) => setEnvironment('brightness', value)} />
      <OptionGroup label="True Tone" values={['on', 'off', 'unknown'] as const} value={environment.trueTone} onChange={(value) => setEnvironment('trueTone', value)} />
      <OptionGroup label="Night Shift" values={['on', 'off', 'unknown'] as const} value={environment.nightShift} onChange={(value) => setEnvironment('nightShift', value)} />
      <OptionGroup label="視距離" values={['20-30cm', '30-40cm', '40-50cm', 'unknown'] as const} value={environment.viewingDistance} onChange={(value) => setEnvironment('viewingDistance', value)} />
      <ActionButton label="ホームへ戻る" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  json: { color: UI_COLORS.textMuted, fontFamily: 'monospace', fontSize: 12, lineHeight: 17 },
});
