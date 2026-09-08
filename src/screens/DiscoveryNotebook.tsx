import { AlphaType, Canvas, ColorType, FilterMode, Image as SkiaImage, MipmapMode, Skia } from '@shopify/react-native-skia';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent, type LayoutRectangle } from 'react-native';
import { ActionButton, Body, ChoiceRow, Heading, Panel, SettingSwitch } from '../components/Layout';
import { availableIllusionNotes, ILLUSION_NOTES, MATERIAL_CREDITS } from '../content/illusionNotes';
import { chromaticComparison, diagramComparison, type ComparisonRaster } from '../content/illusionComparisons';
import { normalizeAudioPreferences } from '../audio';
import type { DiscoveryId, GalleryProgress } from '../domain/gallery';
import type { AppSettings } from '../types/application';
import { UI_COLORS } from '../theme/ui';

export type NotebookPreview = { kind: 'mask'; yaw: number; window?: { x: number; y: number; width: number; height: number } } | undefined;
export type NotebookComparisons = {
  chromaticNeutral: boolean; shadowNeutral: boolean; contourGuide: boolean; rotation: number;
  offset: number; cover: number; scale: number; component: 'composite' | 'low' | 'high'; yaw: number;
};
export function createNotebookComparisons(progress?: GalleryProgress): NotebookComparisons {
  return { chromaticNeutral: false, shadowNeutral: false, contourGuide: false, rotation: 0,
    offset: progress?.wiring.offset ?? 0, cover: progress?.wiring.cover ?? 0,
    scale: 1, component: 'composite', yaw: 0 };
}
export type DiscoveryNotebookProps = { progress: GalleryProgress; completed: boolean; settings: AppSettings;
  initialSelection?: DiscoveryId;
  comparisons?: NotebookComparisons; onComparisonsChange?: (comparisons: NotebookComparisons) => void;
  onSettingsChange: (settings: AppSettings) => void; onClose: () => void;
  onPreview: (preview: NotebookPreview) => void; onPlaySound: () => void; onStopSound: () => void };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function lifetime() { let active = true; return { isActive: () => active, activate: () => { active = true; }, dispose: () => { active = false; } }; }

/** One logical slider with native drag, semantic adjustment and explicit 48pt
 * buttons. A retired note's retained callbacks cannot change the next note. */
export function ComparisonSlider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const owner = useMemo(() => lifetime(), []), pointer = useRef<number | null>(null), width = useRef(240);
  useLayoutEffect(() => { owner.activate(); return () => { pointer.current = null; owner.dispose(); }; }, [owner]);
  const set = (next: number) => { if (owner.isActive() && Number.isFinite(next)) onChange(clamp(next, min, max)); };
  const touch = (phase: 'start' | 'move' | 'end', event: GestureResponderEvent) => {
    if (!owner.isActive()) return;
    const changed = event.nativeEvent.changedTouches?.length ? event.nativeEvent.changedTouches : [event.nativeEvent];
    if (phase === 'start' && pointer.current === null) pointer.current = Number(changed[0]?.identifier);
    const point = changed.find(t => Number(t.identifier) === pointer.current);
    if (!point) return;
    if (phase !== 'end') set(min + clamp(point.locationX / width.current, 0, 1) * (max - min));
    else pointer.current = null;
  };
  return <View style={styles.sliderGroup}>
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `${Math.round((value - min) / (max - min) * 100)}%` }}
      accessibilityActions={[{ name: 'increment', label: '増やす' }, { name: 'decrement', label: '減らす' }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'increment') set(value + step); if (event.nativeEvent.actionName === 'decrement') set(value - step); }}
      onLayout={event => { if (event.nativeEvent.layout.width > 0) width.current = event.nativeEvent.layout.width; }}
      onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
      onTouchStart={event => touch('start', event)} onTouchMove={event => touch('move', event)} onTouchEnd={event => touch('end', event)} onTouchCancel={() => { pointer.current = null; }} style={styles.slider}>
      <Text pointerEvents="none" style={styles.text}>{label}</Text>
      <View pointerEvents="none" style={styles.track}><View style={[styles.thumb, { left: `${clamp((value - min) / (max - min), 0, 1) * 100}%` }]} /></View>
    </View>
    <ChoiceRow><ActionButton label={`${label} −`} onPress={() => set(value - step)} /><ActionButton label={`${label} ＋`} onPress={() => set(value + step)} /></ChoiceRow>
  </View>;
}
export function RasterFigure({ raster, width }: { raster: ComparisonRaster; width: number }) {
  const image = useMemo(() => { const data = Skia.Data.fromBytes(raster.rgba);
    try { return Skia.Image.MakeImage({ width: raster.width, height: raster.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque }, data, raster.width * 4); }
    finally { data.dispose(); }
  }, [raster]);
  useEffect(() => () => image?.dispose(), [image]);
  const height = width * raster.height / raster.width;
  return <View accessibilityRole="image" accessibilityLabel="操作に合わせた比較図" style={{ width, height, alignSelf: 'center' }}>
    {image ? <Canvas testID="notebook-raster" style={StyleSheet.absoluteFill}><SkiaImage image={image} x={0} y={0} width={width} height={height} fit="contain" sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }} /></Canvas> : <Body>比較図を表示できませんでした。</Body>}
  </View>;
}
export function MaterialCredits() {
  return <View testID="material-credits"><Heading>出典と素材クレジット</Heading>{MATERIAL_CREDITS.map(credit => <Panel key={credit.title}>
    <Body>{credit.title}</Body><Body muted>{credit.text}</Body>{credit.urls.map(url => <Text selectable key={url} style={styles.source}>{url}</Text>)}
  </Panel>)}<Body muted>説明とクレジットはオフラインで読めます。CC BY 素材の利用に、同ライセンスにない追加制限を設けません。</Body></View>;
}
export function DiscoveryNotebook({ progress, completed, settings, onSettingsChange, onClose, onPreview, onPlaySound, onStopSound, comparisons, onComparisonsChange, initialSelection }: DiscoveryNotebookProps) {
  const [selected, setSelected] = useState<DiscoveryId | 'credits' | undefined>(() => initialSelection && (completed || progress.discoveries[initialSelection]) ? initialSelection : undefined);
  const [localComparisons, setLocalComparisons] = useState(() => createNotebookComparisons(progress));
  const values = comparisons ?? localComparisons;
  const { chromaticNeutral, shadowNeutral, contourGuide: guide, rotation, offset, cover, scale, component, yaw } = values;
  const neutral = selected === 'chromatic' ? chromaticNeutral : shadowNeutral;
  const owner = useMemo(() => lifetime(), []), { width, height } = useWindowDimensions(), figureWidth = Math.max(128, Math.min(360, width - 64));
  const insets = useSafeAreaInsets();
  const [notebookSize, setNotebookSize] = useState<{ width: number; height: number }>();
  const [maskLayout, setMaskLayout] = useState<LayoutRectangle>();
  const previewWindow = useMemo(() => {
    if (!notebookSize || !maskLayout) return undefined;
    // The SafeAreaView root measures its border box; child layout includes its
    // safe-area padding. The gameplay Canvas fills the remaining content box.
    const contentWidth = notebookSize.width - insets.left - insets.right;
    const contentHeight = notebookSize.height - insets.top - insets.bottom;
    if (contentWidth <= 0 || contentHeight <= 0) return undefined;
    const x = clamp((maskLayout.x - insets.left) / contentWidth, 0, 1);
    const y = clamp((maskLayout.y - insets.top) / contentHeight, 0, 1);
    const right = clamp((maskLayout.x + maskLayout.width - insets.left) / contentWidth, 0, 1);
    const bottom = clamp((maskLayout.y + maskLayout.height - insets.top) / contentHeight, 0, 1);
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
  }, [insets.bottom, insets.left, insets.right, insets.top, maskLayout, notebookSize]);
  useLayoutEffect(() => { owner.activate(); return () => owner.dispose(); }, [owner]);
  useEffect(() => { onPreview(selected === 'mask' ? { kind: 'mask', yaw, ...(previewWindow ? { window: previewWindow } : {}) } : undefined); }, [onPreview, previewWindow, selected, yaw]);
  useEffect(() => () => { onStopSound(); onPreview(undefined); }, [onPreview, onStopSound]);
  const update = (patch: Partial<NotebookComparisons>) => {
    if (!owner.isActive()) return;
    const next = { ...values, ...patch };
    setLocalComparisons(next); onComparisonsChange?.(next);
  };
  const audio = normalizeAudioPreferences(settings.audio), notes = availableIllusionNotes(progress.discoveries, completed);
  const note = ILLUSION_NOTES.find(item => item.id === selected);
  const choose = (id: DiscoveryId | 'credits' | undefined) => { if (!owner.isActive()) return; onStopSound(); setSelected(id); };
  const close = () => { if (!owner.isActive()) return; onStopSound(); onPreview(undefined); onClose(); };
  const raster = useMemo(() => selected === 'chromatic' ? chromaticComparison(neutral, settings.emblemPalette ?? 'baseline') : selected === 'shadow' || selected === 'contour' || selected === 'wiring' ? diagramComparison(selected, { seed: progress.seed, neutral, rotation, guide, offset, cover }) : undefined,
    [cover, guide, neutral, offset, progress.seed, rotation, selected, settings.emblemPalette]);
  const controls = <>
    {selected === 'chromatic' ? <><Body>{chromaticNeutral ? '表示：無彩色（比較の補助）' : '表示：カラー'}</Body><ActionButton label={chromaticNeutral ? 'カラーに戻す' : '無彩色で比べる'} onPress={() => update({ chromaticNeutral: !chromaticNeutral })} /></> : null}
    {selected === 'shadow' ? <><Body>{shadowNeutral ? '背景：共通（比較の補助）' : '背景：元の展示'}</Body><ActionButton label={shadowNeutral ? '元の背景' : '同じ背景で比べる'} onPress={() => update({ shadowNeutral: !shadowNeutral })} /></> : null}
    {selected === 'contour' ? <><ComparisonSlider key="contour-rotation" label="円盤の向き" value={rotation} min={-Math.PI} max={Math.PI} step={Math.PI / 36} onChange={rotation => update({ rotation })} />
      <ActionButton label={guide ? '輪郭ガイドを消す' : '補助の輪郭ガイド'} onPress={() => update({ contourGuide: !guide })} /><Body>{guide ? '補助の輪郭ガイド使用中' : '輪郭ガイド：オフ'}</Body></> : null}
    {selected === 'wiring' ? <><Body>{cover === 0 ? 'カバー：元の位置' : 'カバー：移動した比較位置（補助）'}</Body><ComparisonSlider key="wiring-offset" label="線の高さ" value={offset} min={-.28} max={.28} step={.014} onChange={offset => update({ offset })} />
      <ComparisonSlider key="wiring-cover" label="カバーの位置" value={cover} min={-.97} max={0} step={.097} onChange={cover => update({ cover })} /></> : null}
    {selected === 'hybrid' ? <><ComparisonSlider key="hybrid-scale" label="画像の倍率" value={scale} min={.2} max={1.6} step={.1} onChange={scale => update({ scale })} />
      <ChoiceRow><ActionButton label="同じ合成画像" onPress={() => update({ component: 'composite' })} /><ActionButton label="補助：大きい成分" onPress={() => update({ component: 'low' })} /><ActionButton label="補助：細かい成分" onPress={() => update({ component: 'high' })} /></ChoiceRow>
      <Body>{component === 'composite' ? '拡大縮小しているのは同じ一枚です。' : '成分だけを表示する補助です。本編の画像は入れ替わりません。'}</Body></> : null}
    {selected === 'mask' ? <ComparisonSlider key="mask-yaw" label="仮面を見る位置" value={yaw} min={-Math.PI / 2} max={Math.PI / 2} step={Math.PI / 18} onChange={yaw => update({ yaw })} /> : null}
    {selected === 'shepard' ? <>
      <Body>最大12秒の自作音。音量は増え続けません。</Body>
      <ActionButton label="短い音を再生" disabled={!audio.enabled || !audio.illusionEnabled || audio.effectsVolume <= 0 || settings.horrorIntensity === 'subdued'} onPress={() => { if (owner.isActive()) onPlaySound(); }} />
      <ActionButton label="音を止める" onPress={() => { if (owner.isActive()) onStopSound(); }} />
      <ComparisonSlider key="sound-volume" label="効果音量" value={audio.effectsVolume} min={0} max={1} step={.1} onChange={effectsVolume => onSettingsChange({ ...settings, audio: { ...audio, effectsVolume } })} />
      <SettingSwitch label="演出音" description="短い音の錯覚を任意で再生します。" value={audio.illusionEnabled ?? true} onValueChange={illusionEnabled => { if (!owner.isActive()) return; if (!illusionEnabled) onStopSound(); onSettingsChange({ ...settings, audio: { ...audio, illusionEnabled } }); }} />
      {settings.horrorIntensity === 'subdued' ? <Body>控えめな怖さでは、この演出音を再生しません。</Body> : null}
    </> : null}
  </>;
  const aided = selected === 'chromatic' && chromaticNeutral || selected === 'shadow' && shadowNeutral || selected === 'contour' && guide || selected === 'wiring' && cover !== 0 || selected === 'hybrid' && component !== 'composite';
  const description = note ? <><Body>{progress.discoveries[note.id] ? note.discovery : 'クリア後の自由比較。本編の発見記録には追加しません。'}</Body><Body>{note.explanation}</Body><Body muted>{note.operation}</Body>{controls}{aided ? <Body muted>補助を使った比較です。自然な見え方を確認した記録にはしません。</Body> : null}
    <Body>現象の資料</Body>{note.sources.map(source => <View key={source.url}><Body muted>{source.title}</Body><Text selectable style={styles.source}>{source.url}</Text></View>)}
    <Body>素材クレジット</Body><Body muted>{note.credit}</Body>{note.id === 'mask' ? <Text selectable style={styles.source}>https://creativecommons.org/licenses/by/4.0/</Text> : null}</> : null;
  return <SafeAreaView onLayout={event => { const { width, height } = event.nativeEvent.layout; if (owner.isActive() && width > 0 && height > 0) setNotebookSize(previous => previous?.width === width && previous.height === height ? previous : { width, height }); }} edges={['top', 'right', 'bottom', 'left']} style={[styles.notebook, selected === 'mask' && styles.maskNotebook]} accessibilityViewIsModal testID="discovery-notebook">
    <View style={styles.top}><ActionButton label={selected ? 'メモ一覧へ' : completed ? '結果へ戻る' : '一時停止へ戻る'} onPress={() => selected ? choose(undefined) : close()} /><Heading>{note?.title ?? (selected === 'credits' ? 'クレジット' : '発見メモ')}</Heading></View>
    {selected === 'mask' ? <>
      <View testID="notebook-mask-window" onLayout={event => { if (!owner.isActive()) return; const next = event.nativeEvent.layout; setMaskLayout(previous => previous?.x === next.x && previous.y === next.y && previous.width === next.width && previous.height === next.height ? previous : { ...next }); }} style={{ flex: 1, minHeight: Math.min(180, height * .25) }} pointerEvents="none" />
      <ScrollView testID="notebook-comparison-scroll" style={{ maxHeight: height * .38, backgroundColor: UI_COLORS.background }} contentContainerStyle={styles.content}>{description}</ScrollView>
    </> : <ScrollView testID="notebook-comparison-scroll" contentContainerStyle={styles.content}>
      {!selected ? <>{completed ? <Body>敵のいない比較です。未体験の項目は発見済みにしません。</Body> : <Body>本編で確かめたものだけを記録しています。</Body>}
        {notes.length ? notes.map(item => <ActionButton key={item.id} label={item.title + (progress.discoveries[item.id] ? '' : '（自由比較）')} onPress={() => choose(item.id)} />) : <Body>まだ発見メモはありません。</Body>}
        <ActionButton label="出典と素材クレジット" onPress={() => choose('credits')} />
      </> : selected === 'credits' ? <MaterialCredits /> : <>
        {raster ? <RasterFigure raster={raster} width={figureWidth} /> : null}
        {selected === 'hybrid' ? <View style={{ height: figureWidth, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}><Image testID="notebook-hybrid-image" source={component === 'low' ? require('../../assets/perceptual/hybrid-low-pass.png') : component === 'high' ? require('../../assets/perceptual/hybrid-high-pass.png') : require('../../assets/perceptual/hybrid-composite.png')} style={{ width: figureWidth * scale, height: figureWidth * scale }} resizeMode="contain" /></View> : null}
        {description}
      </>}
    </ScrollView>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  notebook: { flex: 1, backgroundColor: UI_COLORS.background }, maskNotebook: { backgroundColor: 'transparent' },
  top: { backgroundColor: UI_COLORS.background, padding: 12, gap: 6 }, content: { padding: 16, gap: 12, paddingBottom: 32 },
  text: { color: UI_COLORS.text, fontSize: 15 }, source: { color: UI_COLORS.textMuted, fontSize: 12, lineHeight: 18 },
  sliderGroup: { gap: 6 }, slider: { minHeight: 64, borderColor: UI_COLORS.border, borderWidth: 1, borderRadius: 8, padding: 10, gap: 12 },
  track: { height: 3, backgroundColor: UI_COLORS.border, marginHorizontal: 12 }, thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: UI_COLORS.text, position: 'absolute', marginLeft: -10, top: -9 },
});
