import { AlphaType, Canvas, ColorType, FilterMode, Image, MipmapMode, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ActionButton, Body, Screen } from '../components/Layout';
import { createQuickSetupStimulusSpec, quickSetupRasterPair, type QuickSetupAnswer, type QuickSetupSession, type QuickSetupStimulusSpec } from '../domain/calibration/quickSetup';
import { PALETTE_LABELS } from '../domain/emblem/color';
import { UI_COLORS } from '../theme/ui';

const DEFAULT_SPEC = createQuickSetupStimulusSpec();

/** Raw top-down bytes from the same cached raster consumed by the wall adapter.
 * Skia's native ImageInfo API has no color-space argument in this installed
 * version. Preserve its supplied sRGB bytes; actual display matching is pending. */
export function QuickEmblemStimulus({ spec, index, size }: { spec: QuickSetupStimulusSpec; index: number; size: number }) {
  const raster = useMemo(() => quickSetupRasterPair(spec, index).color, [index, spec]);
  const image = useMemo(() => {
    const data = Skia.Data.fromBytes(raster.rgba);
    try {
      return Skia.Image.MakeImage({
        width: raster.width, height: raster.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque,
      }, data, raster.width * 4);
    } finally {
      data.dispose();
    }
  }, [raster]);
  useEffect(() => () => image?.dispose(), [image]);
  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }} accessibilityRole="image"
      accessibilityLabel={`同じ平面に描いた赤と青の輪郭。${PALETTE_LABELS[spec.paletteId]}`}>
      {image ? <Canvas style={StyleSheet.absoluteFill} testID="quick-emblem-canvas">
        <Image image={image} x={0} y={0} width={size} height={size} fit="contain"
          sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }} />
      </Canvas> : <Body>紋章を表示できませんでした。あとで調整して遊べます。</Body>}
    </View>
  );
}

export function QuickSetupScreen({ session, onResponse, onSkip, onExit }: {
  session: QuickSetupSession;
  onResponse: (index: number, answer: QuickSetupAnswer) => void;
  onSkip: () => void;
  onExit: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const index = session.responses.length;
  const spec = session.stimulus ?? DEFAULT_SPEC;
  const submitted = useRef(false);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    // App keys this screen by session ID. The initial false state needs no
    // zero-ms timer, which could otherwise unlock after the first response.
    if (index === 0) return;
    // A brief neutral input gate also catches a second physical tap after rerender.
    const timer = setTimeout(() => { submitted.current = false; setLocked(false); }, 300);
    return () => clearTimeout(timer);
  }, [session.id, index]);
  const submit = (answer: QuickSetupAnswer) => {
    if (submitted.current || index >= 3) return;
    submitted.current = true;
    setLocked(true);
    onResponse(index, answer);
  };
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>見え方を、3つだけ</Text>
      <Text style={styles.progress} accessibilityLiveRegion="polite">{Math.min(index + 1, 3)} / 3</Text>
      <QuickEmblemStimulus spec={spec} index={Math.min(index, 2)} size={Math.min(320, Math.max(128, width - 40), Math.max(128, height * 0.27))} />
      <Body>どちらが手前に見えますか？</Body>
      <Body muted>{PALETTE_LABELS[spec.paletteId]}。見え方は仮の表示設定にだけ使います。</Body>
      <View style={styles.answers}>
        <ActionButton label="赤が手前" onPress={() => submit('redFront')} disabled={locked} testID="quick-answer-red" />
        <ActionButton label="青が手前" onPress={() => submit('blueFront')} disabled={locked} testID="quick-answer-blue" />
        <ActionButton label="同じ・分かりにくい" onPress={() => submit('unclear')} disabled={locked} testID="quick-answer-unclear" />
      </View>
      <ActionButton label="あとで調整して遊ぶ" onPress={onSkip} />
      <ActionButton label="ホームへ戻る" onPress={onExit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: UI_COLORS.text, fontSize: 25, fontWeight: '700' },
  progress: { color: UI_COLORS.textMuted, fontSize: 17, minHeight: 26 },
  answers: { gap: 10 },
});
