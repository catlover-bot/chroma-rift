import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert } from 'react-native';

import App from '../../../App';
import type { IllusionMazeCanvasProps } from '../../rendering/IllusionMazeCanvas';
import { APPLICATION_STORAGE_KEY, resetApplicationStorage } from '../../storage/applicationStorage';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// The native drawing surface finishes one requested animation. App, screen,
// graph, pause and navigation reducers are real; geometry is tested separately.
jest.mock('../../rendering/IllusionMazeCanvas', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    IllusionMazeCanvas: ({ state, onTravelComplete }: IllusionMazeCanvasProps) => {
      React.useEffect(() => {
        if (state.move) onTravelComplete(state.move.session, state.move.token);
      }, [state.move, onTravelComplete]);
      return React.createElement(View, { testID: 'journey-scene', accessibilityLabel: state.currentNodeId });
    },
  };
});

describe('short introduction through both handcrafted stages', () => {
  beforeEach(async () => {
    await resetApplicationStorage();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());

  it('answers only three questions and reaches results through actual adjacent destination controls', async () => {
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('遊ぶ'));
    for (let index = 0; index < 3; index += 1) {
      await waitFor(() => expect(view.getByRole('button', { name: '赤が手前' })).toBeEnabled());
      expect(view.queryByText('強さ')).toBeNull();
      await fireEvent.press(view.getByRole('button', { name: '赤が手前' }));
    }
    expect(await view.findByText('準備できました')).toBeTruthy();
    await fireEvent.press(view.getByText('回廊へ入る'));
    expect(view.getByText('浮遊回廊')).toBeTruthy();

    const walk = async (nodes: string[]) => {
      for (const id of nodes) {
        await fireEvent.press(view.getByRole('button', { name: '移動先' }));
        await fireEvent.press(view.getByTestId(`destination-${id}`));
        await waitFor(() => expect(view.getByTestId('journey-scene').props.accessibilityLabel).toBe(id));
      }
    };
    await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
    await walk(['entry', 'junction', 'alcove', 'junction', 'stair-one', 'stair-two', 'upper-west', 'lookout', 'upper-north', 'overpass', 'exit-approach', 'exit']);
    expect(view.getByText('クリア')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '色を戻す' }));
    expect(view.getByTestId('journey-scene').props.accessibilityLabel).toBe('exit');
    await fireEvent.press(view.getByRole('button', { name: '次のステージ' }));
    expect(view.getByText('つながらない橋')).toBeTruthy();
    await walk(['entry', 'junction', 'alcove', 'junction', 'left-approach', 'left-end']);
    await fireEvent.press(view.getByRole('button', { name: '移動先' }));
    expect(view.queryByTestId('destination-right-end')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: '閉じる' }));
    await fireEvent.press(view.getByRole('button', { name: '視点を変える' }));
    expect(view.getByText('◇ 橋がつながる視点')).toBeTruthy();
    await walk(['right-end', 'right-corner', 'garden', 'right-junction', 'stair', 'exit']);
    await fireEvent.press(view.getByRole('button', { name: '結果を見る' }));
    expect(await view.findByText('ふたつの迷宮を踏破')).toBeTruthy();
    expect(view.getByText('光のかけら 4 / 4')).toBeTruthy();
    expect(view.getByText('色をほどく')).toBeTruthy();
    expect(view.getByText('視点でつながる橋')).toBeTruthy();
    expect(view.queryByText(/confidence|VARIABLE|ベストスコア/)).toBeNull();
    await fireEvent.press(view.getByText('もう一度遊ぶ'));
    expect(view.getByText('浮遊回廊')).toBeTruthy();
    expect(view.getByTestId('journey-scene').props.accessibilityLabel).toBe('start');
  });

  it('persists skipping and skips setup after relaunch without exposing the lab on home', async () => {
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('あとで調整して遊ぶ'));
    expect(view.getByText('準備できました')).toBeTruthy();
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(APPLICATION_STORAGE_KEY);
      expect(JSON.parse(raw!).quickSetupResult.status).toBe('skipped');
    });
    await view.unmount();
    const reopened = await render(<App />);
    await reopened.findByText('遊ぶ');
    expect(reopened.queryByText('開発者ラボ')).toBeNull();
    expect(reopened.queryByText('あとで調整して遊ぶ')).toBeNull();
    await fireEvent.press(reopened.getByText('遊ぶ'));
    expect(reopened.getByText('準備できました')).toBeTruthy();
  });

  it('does not autosave over an unsupported stored version while remaining playable', async () => {
    const raw = '{"schemaVersion":99,"futureData":"preserve"}';
    await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, raw);
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('あとで調整して遊ぶ'));
    await fireEvent.press(view.getByText('回廊へ入る'));
    expect(view.getByText('浮遊回廊')).toBeTruthy();
    expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBe(raw);
    expect(view.getByRole('alert')).toBeTruthy();
  });

  it('locks input and duplicate reset requests until the old data is removed', async () => {
    let confirmReset: (() => void) | undefined;
    let finishDeletion: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      confirmReset = buttons?.find((button) => button.text === 'リセット')?.onPress;
    });
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('設定'));
    const remove = jest.spyOn(AsyncStorage, 'multiRemove').mockImplementationOnce(async (keys) => {
      await new Promise<void>((resolve) => { finishDeletion = resolve; });
      await Promise.all(keys.map((key) => AsyncStorage.removeItem(key)));
    });
    remove.mockClear();
    await fireEvent.press(view.getByText('保存データをリセット'));
    await act(() => { confirmReset?.(); confirmReset?.(); });
    await waitFor(() => expect(finishDeletion).toBeDefined());
    expect(view.queryByText('補助表示')).toBeNull();
    expect(remove).toHaveBeenCalledTimes(1);
    await act(() => finishDeletion?.());
    expect(await view.findByText('あとで調整して遊ぶ')).toBeTruthy();
    await waitFor(async () => {
      const raw = JSON.parse((await AsyncStorage.getItem(APPLICATION_STORAGE_KEY))!);
      expect(raw.quickSetupResult).toBeUndefined();
      expect(raw.settings.depthAssistOverridden).toBe(false);
    });
  });
});
