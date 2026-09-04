import type { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../theme/ui';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const content = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Heading({ children }: PropsWithChildren) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Panel({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

export function ActionButton({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'danger' && styles.dangerButton,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceRow({ children }: PropsWithChildren) {
  return <View style={styles.choiceRow}>{children}</View>;
}

export function SettingSwitch({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
        <Text style={styles.stateText}>{value ? 'オン' : 'オフ'}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: UI_COLORS.border, true: '#5A5A67' }}
        thumbColor={UI_COLORS.text}
      />
    </View>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, gap: 16, paddingHorizontal: 20, paddingVertical: 18 },
  heading: { color: UI_COLORS.text, fontSize: 30, fontWeight: '800', letterSpacing: 0.5 },
  body: { color: UI_COLORS.text, fontSize: 17, lineHeight: 25 },
  muted: { color: UI_COLORS.textMuted },
  panel: {
    backgroundColor: UI_COLORS.panel,
    borderColor: UI_COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  button: {
    alignItems: 'center',
    backgroundColor: UI_COLORS.panelRaised,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButton: { backgroundColor: '#34343E', borderColor: UI_COLORS.focus },
  dangerButton: { backgroundColor: '#392529', borderColor: '#76515A' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.4 },
  buttonText: { color: UI_COLORS.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  settingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 64,
  },
  settingCopy: { flex: 1, gap: 3 },
  settingLabel: { color: UI_COLORS.text, fontSize: 17, fontWeight: '700' },
  settingDescription: { color: UI_COLORS.textMuted, fontSize: 14, lineHeight: 19 },
  stateText: { color: UI_COLORS.text, fontSize: 13, fontWeight: '700' },
  sectionTitle: { color: UI_COLORS.text, fontSize: 19, fontWeight: '800', marginTop: 4 },
  stat: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  statLabel: { color: UI_COLORS.textMuted, flex: 1, fontSize: 15 },
  statValue: { color: UI_COLORS.text, fontSize: 15, fontWeight: '700', textAlign: 'right' },
});
