import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { PLAYER_TEXT } from '../app/playerText';
import { ActionButton, Body } from '../components/Layout';
import { collectSupportDiagnostics } from '../platform/supportDiagnostics';
import { UI_COLORS } from '../theme/ui';

type SupportProps = { renderDiagnostics?: (() => string) | undefined; onClose?: (() => void) | undefined };

/** Mount this only after the player explicitly requests support details. */
export function SupportDetails({ renderDiagnostics, onClose }: SupportProps) {
  const [record, setRecord] = useState(() => collectSupportDiagnostics(renderDiagnostics));
  const [copyStatus, setCopyStatus] = useState('');
  const refresh = () => { const latest = collectSupportDiagnostics(renderDiagnostics); setRecord(latest); return latest; };
  const copy = async () => {
    const latest = refresh();
    try { await Clipboard.setStringAsync(latest); setCopyStatus('情報をコピーしました。'); }
    catch { setCopyStatus('コピーできませんでした。もう一度お試しください。'); }
  };
  return <View style={styles.content}>
    <Body>不具合を調べるためのアプリ情報です。コピーしても、自動では送信されません。</Body>
    <ActionButton label={PLAYER_TEXT.copyInformation} onPress={() => { void copy(); }} />
    <ActionButton label="情報を更新" onPress={() => { refresh(); setCopyStatus(''); }} />
    {onClose ? <ActionButton label={PLAYER_TEXT.closeDetails} onPress={onClose} /> : null}
    {copyStatus ? <Text accessibilityLiveRegion="polite" style={styles.status}>{copyStatus}</Text> : null}
    <Text selectable testID="render-diagnostic-record" style={styles.record}>{record}</Text>
  </View>;
}

export function SupportInformation({ renderDiagnostics }: Pick<SupportProps, 'renderDiagnostics'>) {
  const [open, setOpen] = useState(false);
  return <View style={styles.content}>
    <Body>困ったときは、詳しい情報を開いてアプリの状態を確認できます。</Body>
    {open ? <SupportDetails renderDiagnostics={renderDiagnostics} onClose={() => setOpen(false)} />
      : <ActionButton label={PLAYER_TEXT.details} onPress={() => setOpen(true)} />}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 12, alignSelf: 'stretch', minWidth: 0 },
  status: { color: UI_COLORS.text, fontSize: 15, flexShrink: 1 },
  record: { color: UI_COLORS.textMuted, fontSize: 12, lineHeight: 18, flexShrink: 1 },
});
