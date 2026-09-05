import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { PerspectiveCamera } from 'three';

import App from '../../../App';
import type { IllusionMazeCanvasProps } from '../../rendering/IllusionMazeCanvas';
import { APPLICATION_STORAGE_KEY } from '../../storage/applicationStorage';
import { FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY, resetAllApplicationStorage } from '../../storage/firstPersonStorage';
import type { FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { advanceController, commandController, controllerSnapshot, stopController, worldForController } from '../../rendering/firstPerson/runtimeController';
import { MOVE_SPEED, VERTICAL_FOV } from '../../domain/firstPerson';
import * as appStateModule from '../../app/state';

let mockFirstPersonCanvasProps: FirstPersonCanvasProps | undefined;

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: jest.fn(() => ({})) }));

// Only the native Canvas lifecycle is simulated. The actual first-person screen,
// chapter runtime, settings, checkpoints and App reducers remain in the flow.
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FirstPersonCanvas: (props: FirstPersonCanvasProps) => {
      mockFirstPersonCanvasProps = props;
      const { onReady } = props;
      const initialReady = React.useRef(onReady);
      React.useEffect(() => { initialReady.current(); }, []);
      return React.createElement(View, { testID: 'first-person-native-canvas' });
    },
  };
});

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

describe('first-person introduction and retained two-stage laboratory flow', () => {
  beforeEach(async () => {
    await resetAllApplicationStorage();
    mockFirstPersonCanvasProps = undefined;
    jest.mocked(requireOptionalNativeModule).mockReturnValue({} as ReturnType<typeof requireOptionalNativeModule>);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts exactly three single-tap answers then starts the actual first-person screen', async () => {
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('遊ぶ'));
    const first = view.getByRole('button', { name: '同じ・分かりにくい' });
    await fireEvent.press(first);
    await fireEvent.press(first);
    expect(view.getByText(/2 \/ 3/)).toBeTruthy();
    for (let index = 1; index < 3; index += 1) {
      await waitFor(() => expect(view.getByRole('button', { name: '同じ・分かりにくい' })).toBeEnabled());
      expect(view.queryByText('弱い')).toBeNull();
      await fireEvent.press(view.getByRole('button', { name: '同じ・分かりにくい' }));
    }
    expect(await view.findByText('準備できました')).toBeTruthy();
    await fireEvent.press(view.getByText('迷宮へ入る'));
    expect(await view.findByTestId('first-person-native-canvas')).toBeTruthy();
    expect(view.queryByText('浮遊回廊')).toBeNull();
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(APPLICATION_STORAGE_KEY))!);
      expect(saved.quickSetupResult.answers).toEqual(['unclear', 'unclear', 'unclear']);
      expect(saved.calibrationProfile).toBeUndefined();
    });
  });

  it('guides an older native build before mounting Canvas and can return home', async () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('あとで調整して遊ぶ'));
    await fireEvent.press(view.getByText('迷宮へ入る'));
    expect(await view.findByText('3D対応の開発版が必要です')).toBeTruthy();
    expect(view.queryByTestId('first-person-native-canvas')).toBeNull();
    await fireEvent.press(view.getByText('ホームへ戻る'));
    expect(await view.findByText('遊ぶ')).toBeTruthy();
    expect(requireOptionalNativeModule).toHaveBeenCalledWith('ExpoGL');
  });

  it('walks the real chapter runtime through both puzzles, pause/save, changed return route, exit and chapter-only replay', async () => {
    const reducer = jest.spyOn(appStateModule, 'appReducer');
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('あとで調整して遊ぶ'));
    await fireEvent.press(view.getByText('迷宮へ入る'));
    await view.findByTestId('first-person-native-canvas');
    const camera = new PerspectiveCamera(VERTICAL_FOV, 390 / 844, 0.08, 60);
    const scene = () => mockFirstPersonCanvasProps!;
    const publish = () => scene().onSnapshot(controllerSnapshot(scene().controller));

    // Feed the real controller frame deltas and stick input. Position, collision,
    // ray interactions, progress, checkpoints and camera matrices are never mocked.
    const walk = async (x: number, z: number) => {
      await act(() => {
        const controller = scene().controller;
        for (let frame = 0; frame < 1400; frame += 1) {
          const dx = x - controller.runtime.pose.position.x;
          const dz = z - controller.runtime.pose.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.025 || controller.runtime.progress.cleared) break;
          commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz) - controller.runtime.pose.yaw, pitch: -controller.runtime.pose.pitch });
          controller.input.forward = 1;
          advanceController(controller, Math.min(1 / 60, distance / MOVE_SPEED), camera);
          if (frame === 1399) throw new Error(`Movement blocked before ${x},${z}`);
        }
        stopController(controller);
        publish();
      });
    };
    const settleDoor = async () => {
      await act(() => {
        for (let frame = 0; frame < 100; frame += 1) advanceController(scene().controller, 1 / 60, camera);
        publish();
      });
    };
    const inspect = async (id: 'guide' | 'floor-device' | 'key' | 'exit') => {
      await act(() => {
        const controller = scene().controller;
        const target = worldForController(controller).interactables.find((candidate) => candidate.id === id)!;
        const pose = controller.runtime.pose;
        const dx = target.center.x - pose.position.x;
        const dz = target.center.z - pose.position.z;
        commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz) - pose.yaw, pitch: Math.atan2(target.center.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch });
        advanceController(controller, 0, camera);
        publish();
      });
      expect(controllerSnapshot(scene().controller).target?.id).toBe(id);
      expect(view.getByTestId('interact')).toBeEnabled();
      await fireEvent.press(view.getByTestId('interact'));
    };

    expect(view.getByTestId('interact')).toBeDisabled();
    await walk(0, 1);
    await inspect('guide');
    await walk(0, -4);
    await walk(1.6, -6);
    await inspect('floor-device');
    expect(scene().controller.runtime.progress.sealA).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    expect(scene().controller.runtime.paused).toBe(true);
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY))!).progress.sealA).toBe(true));
    await fireEvent.press(view.getByText('操作と快適設定'));
    await fireEvent(view.getByRole('switch', { name: '左手で見回す' }), 'valueChange', true);
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY))!).controls.handedness).toBe('left'));
    await fireEvent.press(view.getByText('一時停止メニュー'));
    await fireEvent.press(view.getByText('再開する'));
    await settleDoor();
    for (const [x, z] of [[0, -6], [0, -9], [0, -11], [5, -11], [5, -13.5], [8, -13.5]]) await walk(x!, z!);
    await inspect('key');
    expect(scene().controller.runtime.progress.sealB).toBe(true);
    expect(scene().controller.runtime.progress.variant).toBe('exit');
    await settleDoor();
    for (const [x, z] of [[11, -13.5], [11, -6], [11, -4], [2, -4], [0, -4], [0, 7], [0, 12.3]]) await walk(x!, z!);
    await inspect('exit');
    expect(scene().controller.runtime.progress.cleared).toBe(false);
    await settleDoor();
    await walk(0, 15.5);
    expect(await view.findByText('帰り道のない入口から脱出')).toBeTruthy();
    expect(reducer.mock.calls.some(([, action]) => action.type === 'COMPLETE_CHAPTER')).toBe(true);
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY))!).progress.cleared).toBe(true));
    const oldScene = scene();
    await fireEvent.press(view.getByText('章を最初から遊ぶ'));
    await view.findByTestId('first-person-native-canvas');
    expect(scene().controller.runtime.progress.sealA).toBe(false);
    expect(scene().controller.runtime.progress.sealB).toBe(false);
    expect(scene().controller.runtime.progress.cleared).toBe(false);
    await act(() => oldScene.onSnapshot(controllerSnapshot(oldScene.controller)));
    expect(scene().controller.runtime.progress.cleared).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY))!).controls.handedness).toBe('left');
    expect(JSON.parse((await AsyncStorage.getItem(APPLICATION_STORAGE_KEY))!).quickSetupResult.status).toBe('skipped');
  });

  it('retains the twelve-question detailed adjustment through settings', async () => {
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('設定'));
    await fireEvent.press(view.getByText('詳しく調整する'));
    await fireEvent.press(view.getByText('12問を始める'));
    expect(view.getByText('1 / 12')).toBeTruthy();
    await fireEvent.press(view.getByTestId('answer-red'));
    expect(view.getByTestId('strength-1')).toBeTruthy();
    await fireEvent.press(view.getByTestId('strength-2'));
    expect(view.getByText('2 / 12')).toBeTruthy();
    await fireEvent.press(view.getByText('調整を中断する'));
    expect(view.getByText('詳しく調整する')).toBeTruthy();
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(APPLICATION_STORAGE_KEY))!);
      expect(saved.calibrationSession.responses).toHaveLength(1);
      expect(saved.calibrationSession.responses[0].stimulusVersion).toBe(2);
    });
  });

  it('falls back safely from unsupported first-person progress while preserving its raw record', async () => {
    const raw = '{"schemaVersion":99,"futureChapter":"keep"}';
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('あとで調整して遊ぶ'));
    await fireEvent.press(view.getByText('迷宮へ入る'));
    expect(await view.findByTestId('first-person-native-canvas')).toBeTruthy();
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(raw);
    expect(view.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('retains both handcrafted stages through explicit developer settings and actual adjacent destination controls', async () => {
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('遊ぶ'));
    for (let index = 0; index < 3; index += 1) {
      await waitFor(() => expect(view.getByRole('button', { name: '赤が手前' })).toBeEnabled());
      expect(view.queryByText('強さ')).toBeNull();
      await fireEvent.press(view.getByRole('button', { name: '赤が手前' }));
    }
    expect(await view.findByText('準備できました')).toBeTruthy();
    await fireEvent.press(view.getByText('ホームへ戻る'));
    await fireEvent.press(view.getByText('設定'));
    await fireEvent.press(view.getByText('旧2.5D迷宮（開発用）'));
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
    await fireEvent.press(reopened.getByText('迷宮へ入る'));
    expect(await reopened.findByTestId('first-person-native-canvas')).toBeTruthy();
  });

  it('does not autosave over an unsupported stored version while remaining playable', async () => {
    const raw = '{"schemaVersion":99,"futureData":"preserve"}';
    await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, raw);
    const view = await render(<App />);
    await fireEvent.press(await view.findByText('あとで調整して遊ぶ'));
    await fireEvent.press(view.getByText('迷宮へ入る'));
    expect(await view.findByTestId('first-person-native-canvas')).toBeTruthy();
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
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith([FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY]);
    await act(() => finishDeletion?.());
    expect(await view.findByText('あとで調整して遊ぶ')).toBeTruthy();
    await waitFor(async () => {
      const raw = JSON.parse((await AsyncStorage.getItem(APPLICATION_STORAGE_KEY))!);
      expect(raw.quickSetupResult).toBeUndefined();
      expect(raw.settings.depthAssistOverridden).toBe(false);
    });
  });
});
