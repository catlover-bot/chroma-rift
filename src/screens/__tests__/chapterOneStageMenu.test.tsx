import { fireEvent, render } from '@testing-library/react-native';
import { stageModule } from '../../domain/stageKit/modules';
import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../types/application';
import { CampaignStageNotebook } from '../CampaignStageNotebook';
import { FirstPersonScreen } from '../FirstPersonScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => ({ FirstPersonCanvas: jest.fn(({ controller, onReady }: FirstPersonCanvasProps) => {
  const React = require('react');
  React.useEffect(() => { Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true }); onReady(); }, [controller, onReady]);
  return null;
}) }));
const canvas = jest.mocked(FirstPersonCanvas);

it.each(['mirror-corridor-v1', 'departure-control-v1'] as const)(
  'lets the player read notes and change fear in %s without resetting the stage', async chapterId => {
    canvas.mockClear();
    const module = stageModule(chapterId)!;
    const checkpoint = module.checkpoint(module.create());
    const onSettingsChange = jest.fn();
    const props = { chapterId, checkpoint, controls: DEFAULT_FIRST_PERSON_CONTROLS, settings: DEFAULT_SETTINGS,
      preferredColor: 'neutral' as const, onSettingsChange, onControlsChange: jest.fn(), onCheckpoint: jest.fn(),
      onComplete: jest.fn(), onRestart: jest.fn(), onExit: jest.fn() };
    const view = await render(<FirstPersonScreen {...props} />);
    const controller = canvas.mock.calls.at(-1)![0].controller;
    await fireEvent.press(view.getByTestId('pause-control'));
    expect(controller.runtime.paused).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: '発見メモ' }));
    expect(view.getByTestId('campaign-stage-notebook')).toBeTruthy();
    expect(view.getByText('まだ発見メモはありません。')).toBeTruthy();
    expect(controller.runtime.paused).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: '一時停止へ戻る' }));
    await fireEvent.press(view.getByRole('button', { name: '操作と快適設定' }));
    expect(view.getByText('怖さ')).toBeTruthy();
    const before = JSON.stringify(controller.runtime.stageSession?.value);
    await fireEvent.press(view.getByRole('button', { name: '控えめな怖さ' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, horrorIntensity: 'subdued' });
    await view.rerender(<FirstPersonScreen {...props} settings={{ ...DEFAULT_SETTINGS, horrorIntensity: 'subdued' }} />);
    expect(controller.horrorIntensity).toBe('subdued');
    expect(controller.runtime.paused).toBe(true);
    expect(JSON.stringify(controller.runtime.stageSession?.value)).toBe(before);
  },
);

it('keeps the hidden probe free of chapter notes and actor fear controls', async () => {
  canvas.mockClear();
  const chapterId = 'stage-kit-probe';
  const checkpoint = stageModule(chapterId)!.checkpoint(stageModule(chapterId)!.create());
  const view = await render(<FirstPersonScreen chapterId={chapterId} checkpoint={checkpoint}
    controls={DEFAULT_FIRST_PERSON_CONTROLS} settings={DEFAULT_SETTINGS} preferredColor="neutral"
    onSettingsChange={jest.fn()} onControlsChange={jest.fn()} onCheckpoint={jest.fn()}
    onComplete={jest.fn()} onRestart={jest.fn()} onExit={jest.fn()} />);
  await fireEvent.press(view.getByTestId('pause-control'));
  expect(view.queryByRole('button', { name: '発見メモ' })).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '操作と快適設定' }));
  expect(view.queryByText('怖さ')).toBeNull();
});

it('separates the inspected figure-ground display from the actual mirror', async () => {
  const module = stageModule('mirror-corridor-v1')!;
  const checkpoint = module.checkpoint(module.create());
  const observed = { ...checkpoint, stageData: { ...(checkpoint.stageData as object), figureInspected: true, mirrorInspected: true } };
  const view = await render(<CampaignStageNotebook areaId="chapter-1-area-04" checkpoint={observed} onClose={jest.fn()} />);
  expect(view.getByText('顔と顔の間の輪郭')).toBeTruthy();
  expect(view.getByText('背後を映す鏡')).toBeTruthy();
  expect(view.getByText(/図地の見方が変わっても飾りは動かない/)).toBeTruthy();
  expect(view.getByText(/平面鏡は背後の実際の通路をその場で映す/)).toBeTruthy();
  expect(view.queryByText('巻き上げた歯止め')).toBeNull();
});

it('shows the final attendance note only after isolation and stopping are recorded', async () => {
  const module = stageModule('departure-control-v1')!;
  const checkpoint = module.checkpoint(module.create());
  const isolated = { ...checkpoint, stageData: { ...(checkpoint.stageData as object), keyAvailable: false, keyInstalled: true, procedureRead: true, isolated: true } };
  const beforeStop = await render(<CampaignStageNotebook areaId="chapter-1-area-05" checkpoint={isolated} onClose={jest.fn()} />);
  expect(beforeStop.getByText('収容区画の隔離')).toBeTruthy();
  expect(beforeStop.queryByText('在館反応の変化')).toBeNull();
  const stopped = { ...isolated, stageData: { ...(isolated.stageData as object), stopped: true } };
  await beforeStop.rerender(<CampaignStageNotebook areaId="chapter-1-area-05" checkpoint={stopped} onClose={jest.fn()} />);
  expect(beforeStop.getByText('在館反応の変化')).toBeTruthy();
  expect(beforeStop.getByText(/在館反応 01/)).toBeTruthy();
});
