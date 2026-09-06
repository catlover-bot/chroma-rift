import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { fireEvent, render } from '@testing-library/react-native';

import { createQuickSetupStimulusSpec } from '../../domain/calibration/quickSetup';
import { getSealRasterPair } from '../../domain/emblem/presentation';
import { bottomUpRGBA } from '../../domain/emblem/stimulus';
import { DEFAULT_SETTINGS } from '../../types/application';
import { QuickEmblemStimulus, QuickSetupScreen } from '../QuickSetupScreen';
import { SettingsScreen } from '../SettingsScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

describe('shared emblem setup rendering at the mocked Skia boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes the wall raster unchanged to Skia in top-down RGBA order and owns the image lifetime', async () => {
    const spec = createQuickSetupStimulusSpec('muted');
    const raster = getSealRasterPair(22, 'muted', 'unknown', 512).color;
    const view = await render(<QuickEmblemStimulus spec={spec} index={1} size={220} />);
    expect(view.getByTestId('quick-emblem-canvas')).toBeTruthy();
    expect(Skia.Data.fromBytes).toHaveBeenCalledTimes(1);
    const [info, data, rowBytes] = jest.mocked(Skia.Image.MakeImage).mock.calls[0]!;
    expect(info).toEqual({ width: 512, height: 512, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque });
    expect(rowBytes).toBe(512 * 4);
    const supplied = jest.mocked(Skia.Data.fromBytes).mock.calls[0]![0];
    expect(supplied).toBe(raster.rgba);
    const flipped = bottomUpRGBA(raster);
    const asymmetricByte = raster.rgba.findIndex((value, index) => value !== flipped[index]);
    expect(asymmetricByte).toBeGreaterThanOrEqual(0);
    expect(supplied[asymmetricByte]).not.toBe(flipped[asymmetricByte]);
    expect(data.dispose).toHaveBeenCalledTimes(1);
    const image = jest.mocked(Skia.Image.MakeImage).mock.results[0]!.value;
    await view.rerender(<QuickEmblemStimulus spec={spec} index={1} size={280} />);
    expect(Skia.Image.MakeImage).toHaveBeenCalledTimes(1);
    await view.unmount();
    expect(image.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps all three single-tap response actions and optional skip while presenting the selected palette', async () => {
    const response = jest.fn();
    const skip = jest.fn();
    const spec = createQuickSetupStimulusSpec('alternate');
    const view = await render(<QuickSetupScreen session={{ id: 'three', responses: [], stimulus: spec }} onResponse={response} onSkip={skip} onExit={jest.fn()} />);
    expect(view.getByText('表示B。見え方は仮の表示設定にだけ使います。')).toBeTruthy();
    expect(view.getByRole('button', { name: '赤が手前' })).toBeTruthy();
    expect(view.getByRole('button', { name: '青が手前' })).toBeTruthy();
    const unsure = view.getByRole('button', { name: '同じ・分かりにくい' });
    await fireEvent.press(unsure);
    await fireEvent.press(unsure);
    expect(response).toHaveBeenCalledTimes(1);
    expect(response).toHaveBeenCalledWith(0, 'unclear');
    await fireEvent.press(view.getByRole('button', { name: 'あとで調整して遊ぶ' }));
    expect(skip).toHaveBeenCalledTimes(1);
  });

  it('exposes explicitly named palettes independently from the old maze intensity setting', async () => {
    const onChange = jest.fn();
    const view = await render(<SettingsScreen settings={DEFAULT_SETTINGS} onChange={onChange} onQuickSetup={jest.fn()} onRecalibrate={jest.fn()} onReset={jest.fn()} onBack={jest.fn()} />);
    expect(view.getByRole('button', { name: '表示A（選択中）' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '控えめ' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, emblemPalette: 'muted' });
    await fireEvent.press(view.getByRole('button', { name: '表示B' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, emblemPalette: 'alternate' });
  });
});
