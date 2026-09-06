import 'react-native-gesture-handler/jestSetup';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return mock;
});

jest.mock('react-native-worklets', () => ({
  ...require('react-native-worklets/src/mock'),
  scheduleOnRN: (callback: (...args: unknown[]) => unknown, ...args: unknown[]) => callback(...args),
}));

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Component = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
  return {
    Canvas: Component,
    Image: Component,
    AlphaType: { Opaque: 1 },
    ColorType: { RGBA_8888: 4 },
    FilterMode: { Nearest: 0 },
    MipmapMode: { None: 0 },
    Skia: {
      Data: { fromBytes: jest.fn((bytes: Uint8Array) => ({ bytes, dispose: jest.fn() })) },
      Image: {
        MakeImage: jest.fn((info: { width: number; height: number }, data: { bytes: Uint8Array }, bytesPerRow: number) => ({
          ...info, bytes: data.bytes, bytesPerRow, dispose: jest.fn(),
        })),
      },
    },
    Circle: Component,
    Group: Component,
    Line: Component,
    Rect: Component,
    Path: Component,
    RoundedRect: Component,
    Oval: Component,
    vec: (x: number, y: number) => ({ x, y }),
  };
});
