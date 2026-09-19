import { fireEvent, render } from '@testing-library/react-native';
import { Alert, Dimensions } from 'react-native';
import { CalibrationResultScreen } from '../CalibrationResultScreen';
import { ChapterOneHomeScreen } from '../ChapterOneHomeScreen';
import { ChapterOneEndingScreen } from '../ChapterOneEndingScreen';
import { SettingsScreen } from '../SettingsScreen';
import { calculateCalibrationProfile } from '../../domain/calibration/scoring';
import type { DepthPreference } from '../../domain/calibration/types';
import { DEFAULT_SETTINGS } from '../../types/application';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// Collect only visible host text and accessibility copy, not style, testID or source identifiers.
function playerText(tree: unknown): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(playerText).join('\n');
  if (tree && typeof tree === 'object') {
    const node = tree as { props?: { accessibilityLabel?: string; accessibilityHint?: string; accessibilityValue?: { text?: string }; accessibilityActions?: { label?: string }[] }; children?: unknown };
    return [node.props?.accessibilityLabel, node.props?.accessibilityHint, node.props?.accessibilityValue?.text,
      ...(node.props?.accessibilityActions ?? []).map(action => action.label), playerText(node.children)].filter(Boolean).join('\n');
  }
  return '';
}
const deny = /goal-\d+|release-js|\b(?:native|GL|renderer|framebuffer|checkpoint|schema|Runtime|Stage Kit|BGM|SE|RED_FRONT|BLUE_FRONT|VARIABLE|SOFT_DEPTH)\b|ランタイム|スキーマ|ハプティクス|原文|Development Build/;
const noop = jest.fn();
const settingsProps = { settings: DEFAULT_SETTINGS, onChange: noop, onRecalibrate: noop, onQuickSetup: noop, onReset: noop, onResetChapter: noop, currentChapterName: '第一章', onBack: noop };
const originalDev = __DEV__, originalProfile = process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE;
afterEach(() => { Object.defineProperty(globalThis, '__DEV__', { value: originalDev, configurable: true }); if (originalProfile === undefined) delete process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE; else process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = originalProfile; jest.restoreAllMocks(); });

it.each<DepthPreference>(['RED_FRONT', 'BLUE_FRONT', 'VARIABLE', 'SOFT_DEPTH'])('renders %s as Japanese while retaining its saved classification', async preference => {
  const profile = { ...calculateCalibrationProfile([]), preference };
  const view = await render(<CalibrationResultScreen profile={profile} onMaze={noop} onRecalibrate={noop} onHome={noop} />);
  expect(playerText(view.toJSON())).not.toMatch(deny);
  expect(view.getByText('見え方の傾向')).toBeTruthy();
  expect(profile.preference).toBe(preference);
});

it.each(['preview', 'production'])('audits %s home, all settings panels, reset alerts and ending accessibility copy', async profile => {
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true }); process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = profile;
  const dimensions = Dimensions.get('window');
  Dimensions.set({ window: { width: 320, height: 568, scale: 2, fontScale: 2 }, screen: { width: 320, height: 568, scale: 2, fontScale: 2 } });
  try {
    const home = await render(<ChapterOneHomeScreen loading={false} replayable={[]} showAreas={false} showDiscoveries={false} discoveries={{}} onContinue={noop} onNew={noop} onImport={noop} onAreas={noop} onDiscoveries={noop} onHome={noop} onReplay={noop} onEnding={noop} onSettings={noop} />);
    expect(playerText(home.toJSON())).not.toMatch(deny); expect(home.getByText('錯視館')).toBeTruthy();
    expect(home.getByLabelText('さくしかん').props.accessibilityLanguage).toBe('ja-JP');
    expect(playerText(home.toJSON())).not.toMatch(/CHROMA RIFT/);
    await home.unmount();
    const alert = jest.spyOn(Alert, 'alert');
    const settings = await render(<SettingsScreen {...settingsProps} />);
    expect(playerText(settings.toJSON())).not.toMatch(deny);
    for (const name of ['このアプリについて', '出典と素材クレジット', 'プライバシー', 'サポート']) {
      await fireEvent.press(settings.getByRole('button', { name }));
      expect(playerText(settings.toJSON())).not.toMatch(deny);
      expect(playerText(settings.toJSON())).not.toMatch(/CHROMA RIFT/);
      if (name === 'このアプリについて') expect(settings.getByText(/錯視館（さくしかん）/)).toBeTruthy();
      expect(settings.queryByTestId('render-diagnostic-record')).toBeNull();
    }
    await fireEvent.press(settings.getByRole('button', { name: '第一章だけを最初から' }));
    await fireEvent.press(settings.getByRole('button', { name: '保存データをリセット' }));
    for (const [title, message, buttons] of alert.mock.calls) expect([title, message, ...buttons?.map(button => button.text) ?? []].join('\n')).not.toMatch(deny);
    await settings.unmount();
    const ending = await render(<ChapterOneEndingScreen onHome={noop} onAreas={noop} onDiscoveries={noop} />);
    expect(playerText(ending.toJSON())).not.toMatch(deny);
    await fireEvent(ending.getByRole('button', { name: 'クレジットを表示' }), 'accessibilityTap');
    expect(playerText(ending.toJSON())).not.toMatch(deny);
    expect(ending.getByText('錯視館')).toBeTruthy();
    expect(ending.getByLabelText('さくしかん').props.accessibilityLanguage).toBe('ja-JP');
    expect(playerText(ending.toJSON())).not.toMatch(/CHROMA RIFT/);
    expect(ending.getByText(/Wael Tsar \/ cmglee/)).toBeTruthy();
    await ending.unmount();
  } finally { Dimensions.set({ window: dimensions, screen: dimensions }); }
});
