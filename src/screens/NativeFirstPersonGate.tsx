import { Component, lazy, Suspense, type ErrorInfo, type PropsWithChildren } from 'react';

import { ActionButton, Body, Heading, Screen } from '../components/Layout';
import { hasNative3D } from '../platform/native3D';
import type { FirstPersonScreenProps } from './FirstPersonScreen';

// Do not evaluate the native R3F/expo-gl import graph in the older Skia build.
const FirstPerson = lazy(async () => {
  // A literal require inside the lazy callback defers evaluation in Metro and Jest.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('./FirstPersonScreen') as typeof import('./FirstPersonScreen');
  return { default: module.FirstPersonScreen };
});

class Native3DBoundary extends Component<PropsWithChildren<{ onExit: () => void }>, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) console.error('[CHROMA RIFT 3D: native screen boundary]', error, info.componentStack);
  }
  render() {
    if (this.state.failed) return (
      <Screen>
        <Heading>3Dを開始できませんでした</Heading>
        <Body>3D対応の開発版を確認して、アプリを開き直してください。</Body>
        <ActionButton label="ホームへ戻る" onPress={this.props.onExit} />
      </Screen>
    );
    return this.props.children;
  }
}

export function NativeFirstPersonGate(props: FirstPersonScreenProps) {
  if (!hasNative3D()) return (
    <Screen>
      <Heading>3D対応の開発版が必要です</Heading>
      <Body>3D対応の開発版をインストールしてください。</Body>
      <Body muted>現在の開発版は色の調整に対応しています。一人称の章には、新しいDevelopment Buildが必要です。</Body>
      <ActionButton label="ホームへ戻る" onPress={props.onExit} />
    </Screen>
  );
  return (
    <Native3DBoundary onExit={props.onExit}>
      <Suspense fallback={<Screen><Heading>迷宮を準備しています</Heading><ActionButton label="ホームへ戻る" onPress={props.onExit} /></Screen>}>
        <FirstPerson {...props} />
      </Suspense>
    </Native3DBoundary>
  );
}
