import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Dimensions } from 'react-native';

import { IllusionMazeCanvas, type IllusionMazeCanvasProps } from '../../rendering/IllusionMazeCanvas';
import { DEFAULT_SETTINGS } from '../../types/application';
import { IllusionMazeScreen, type IllusionMazeScreenProps } from '../IllusionMazeScreen';

jest.mock('../../rendering/IllusionMazeCanvas', () => ({ IllusionMazeCanvas: jest.fn(() => null) }));
const canvas = jest.mocked(IllusionMazeCanvas);
function scene(): IllusionMazeCanvasProps {
  return canvas.mock.calls[canvas.mock.calls.length - 1]![0];
}
function props(overrides: Partial<IllusionMazeScreenProps> = {}): IllusionMazeScreenProps {
  return { levelIndex: 0, settings: { ...DEFAULT_SETTINGS }, preferredColor: 'neutral', onSettingsChange: jest.fn(), onComplete: jest.fn(), onExit: jest.fn(), ...overrides };
}
async function arrive() {
  const current = scene();
  const move = current.state.move!;
  await act(() => current.onTravelComplete(move.session, move.token));
}

describe('playable illusion maze controls', () => {
  beforeEach(() => {
    canvas.mockClear();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('offers actual adjacent destinations by name and locks repeated movement and camera taps', async () => {
    const view = await render(<IllusionMazeScreen {...props({ levelIndex: 1 })} />);
    await fireEvent.press(view.getByRole('button', { name: '移動先' }));
    expect(view.queryByTestId('destination-right-end')).toBeNull();
    const destination = view.getByTestId('destination-entry');
    await fireEvent.press(destination);
    const firstMove = scene().state.move;
    await fireEvent.press(destination);
    expect(scene().state.move).toEqual(firstMove);
    expect(view.getByRole('button', { name: '視点（移動中）' })).toBeDisabled();
    await arrive();
    expect(scene().state.currentNodeId).toBe('entry');
    await fireEvent.press(view.getByRole('button', { name: '視点を変える' }));
    expect(scene().state.camera).toBe('b');
    expect(view.getByText('◇ 橋がつながる視点')).toBeTruthy();
  });

  it('cancels at the last landed floor on pause and ignores the canceled callback after resuming', async () => {
    const view = await render(<IllusionMazeScreen {...props()} />);
    await fireEvent.press(view.getByRole('button', { name: '移動先' }));
    await fireEvent.press(view.getByTestId('destination-entry'));
    const old = scene();
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    expect(scene().state.status).toBe('paused');
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    await act(() => old.onTravelComplete(old.state.move!.session, old.state.move!.token));
    expect(scene().state.currentNodeId).toBe('start');
    expect(scene().state.status).toBe('playing');
    await fireEvent.press(view.getByRole('button', { name: '移動先' }));
    await fireEvent.press(view.getByTestId('destination-entry'));
    await arrive();
    expect(scene().state.currentNodeId).toBe('entry');
  });

  it('protects a restarted session from an old completion', async () => {
    const view = await render(<IllusionMazeScreen {...props()} />);
    await fireEvent.press(view.getByRole('button', { name: '移動先' }));
    await fireEvent.press(view.getByTestId('destination-entry'));
    const old = scene();
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: 'ステージをやり直す' }));
    await fireEvent.press(view.getByRole('button', { name: '移動先' }));
    await fireEvent.press(view.getByTestId('destination-entry'));
    const newMove = scene().state.move;
    await act(() => old.onTravelComplete(old.state.move!.session, old.state.move!.token));
    expect(scene().state.move).toEqual(newMove);
    expect(scene().state.currentNodeId).toBe('start');
    await arrive();
    expect(scene().state.currentNodeId).toBe('entry');
  });

  it('backgrounds into pause without finishing movement', async () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    const view = await render(<IllusionMazeScreen {...props()} />);
    await fireEvent.press(view.getByRole('button', { name: '移動先' }));
    await fireEvent.press(view.getByTestId('destination-entry'));
    const old = scene();
    const stateListeners = listener.mock.calls.filter(([event]) => event === 'change').map(([, callback]) => callback);
    await act(() => stateListeners.forEach((callback) => callback('background')));
    await act(() => old.onTravelComplete(old.state.move!.session, old.state.move!.token));
    expect(scene().state.status).toBe('paused');
    expect(scene().state.currentNodeId).toBe('start');
    await act(() => stateListeners.forEach((callback) => callback('active')));
    expect(view.getByRole('button', { name: '再開する' })).toBeTruthy();
  });

  it('keeps projection, position, collectible state and destinations identical during color comparison', async () => {
    const original = props();
    const view = await render(<IllusionMazeScreen {...original} />);
    const before = scene();
    await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
    expect(scene().state.neutralColors).toBe(true);
    expect(scene().projection).toBe(before.projection);
    expect(scene().state.currentNodeId).toBe(before.state.currentNodeId);
    expect(scene().state.collected).toEqual(before.state.collected);
    expect(scene().destinationIds).toEqual(before.destinationIds);
    await view.rerender(<IllusionMazeScreen {...original} preferredColor="blue" settings={{ ...original.settings, depthAssist: false }} />);
    expect(scene().destinationIds).toEqual(before.destinationIds);
    expect(scene().state.assist).toBe(false);
    expect(scene().projection).toBe(before.projection);
  });

  it('renders current VoiceOver destinations on initial reader detection and updates after landing', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const view = await render(<IllusionMazeScreen {...props()} />);
    expect(view.getByTestId('destination-entry')).toBeTruthy();
    expect(view.queryByTestId('destination-junction')).toBeNull();
    await fireEvent.press(view.getByTestId('destination-entry'));
    await arrive();
    expect(view.getByTestId('destination-junction')).toBeTruthy();
    expect(view.getByTestId('destination-start')).toBeTruthy();
  });

  it('announces movement, landing and collection once to VoiceOver', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const original = props();
    const view = await render(<IllusionMazeScreen {...original} />);
    await fireEvent.press(view.getByTestId('destination-entry'));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('入口の先へ移動します。');
    await arrive();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('入口の先。');
    await fireEvent.press(view.getByTestId('destination-junction'));
    await arrive();
    await fireEvent.press(view.getByTestId('destination-alcove'));
    const lastMove = scene();
    await arrive();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('かけらの小部屋。光のかけらを見つけました。');
    const count = jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls.length;
    await act(() => lastMove.onTravelComplete(lastMove.state.move!.session, lastMove.state.move!.token));
    await view.rerender(<IllusionMazeScreen {...original} />);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(count);
  });

  it('announces the special connection when the fixed camera aligns the bridge', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const view = await render(<IllusionMazeScreen {...props({ levelIndex: 1 })} />);
    await fireEvent.press(view.getByRole('button', { name: '視点を変える' }));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('高い島の入口。橋の端がそろいました。渡れます。');
  });

  it('keeps the named movement sheet usable if native screen reader detection rejects', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockRejectedValue(new Error('native detection unavailable'));
    const view = await render(<IllusionMazeScreen {...props()} />);
    await fireEvent.press(view.getByRole('button', { name: '移動先' }));
    expect(view.getByTestId('destination-entry')).toBeTruthy();
  });

  it('uses a scrollable layout with bounded canvas and full-size controls on a small screen with large text', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(() => Dimensions.set({ window: { width: 320, height: 568, scale: 2, fontScale: 2 }, screen: { width: 320, height: 568, scale: 2, fontScale: 2 } }));
    try {
      const view = await render(<IllusionMazeScreen {...props({ levelIndex: 1 })} />);
      expect(view.getByTestId('compact-gameplay')).toBeTruthy();
      expect(view.queryByTestId('standard-gameplay')).toBeNull();
      expect(view.getByTestId('illusion-game-area')).toHaveStyle({ flex: 0, height: 568 * 0.48 });
      expect(view.getByRole('button', { name: '移動先' })).toHaveStyle({ minHeight: 48, minWidth: 44 });
      await fireEvent(view.getByTestId('illusion-game-area'), 'layout', { nativeEvent: { layout: { width: 320, height: 568 * 0.48 } } });
      expect(scene().height).toBe(568 * 0.48);
      await fireEvent.press(view.getByRole('button', { name: '移動先' }));
      expect(view.getByTestId('destination-entry')).toBeTruthy();
      await view.unmount();
    } finally {
      await act(() => Dimensions.set({ window, screen }));
    }
  });

  it('retains the clear scene for comparison and allows pause/replay before committing completion once', async () => {
    const original = props();
    const view = await render(<IllusionMazeScreen {...original} />);
    for (const id of ['entry', 'junction', 'alcove', 'junction', 'stair-one', 'stair-two', 'upper-west', 'lookout', 'upper-north', 'overpass', 'exit-approach', 'exit']) {
      await fireEvent.press(view.getByRole('button', { name: '移動先' }));
      await fireEvent.press(view.getByTestId(`destination-${id}`));
      await arrive();
    }
    expect(scene().state.status).toBe('cleared');
    expect(original.onComplete).not.toHaveBeenCalled();
    const clearedProjection = scene().projection;
    await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
    expect(scene().projection).toBe(clearedProjection);
    expect(scene().state.currentNodeId).toBe('exit');
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    expect(view.getByRole('button', { name: 'ステージをやり直す' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    const next = view.getByRole('button', { name: '次のステージ' });
    await fireEvent.press(next);
    await fireEvent.press(next);
    expect(original.onComplete).toHaveBeenCalledTimes(1);
    expect(original.onComplete).toHaveBeenCalledWith({ levelId: 'floating-corridor', collectibleCount: 2, discoveredMechanisms: ['色の床模様', '色をほどく'] });
  });
});
