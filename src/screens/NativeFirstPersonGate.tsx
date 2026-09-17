import { Component, lazy, Suspense, useEffect, useState, type PropsWithChildren } from 'react';

import { ActionButton, Body, Heading, Screen } from '../components/Layout';
import { PLAYER_TEXT } from '../app/playerText';
import { SupportInformation } from './SupportInformation';
import { hasNative3D } from '../platform/native3D';
import { buildIdentity } from '../platform/buildIdentity';
import { boundedDiagnosticText } from '../platform/diagnosticText';
import { rememberFailureSnapshot } from '../rendering/firstPerson/failureLedger';
import type { FirstPersonScreenProps } from './FirstPersonScreen';

// Do not evaluate the native R3F/expo-gl import graph in the older Skia build.
const FirstPerson = lazy(async () => {
  // A literal require inside the lazy callback defers evaluation in Metro and Jest.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('./FirstPersonScreen') as typeof import('./FirstPersonScreen');
  return { default: module.FirstPersonScreen };
});

/** A failure before a controller exists still remains available after returning home.
 * Only lightweight leaves are imported here; never evaluate the Three/GL graph. */
function GateFailure({ reasonCode, error, onExit }: { reasonCode: 'NATIVE_SCREEN' | 'MISSING_NATIVE_GL'; error: Error; onExit: () => void }) {
  const [record] = useState(() => {
    const identity = buildIdentity();
    return JSON.stringify({ label: 'FIRST_FAILURE', schemaVersion: 1,
      app: { version: identity.appVersion, build: identity.nativeBuild, profileMarker: identity.profileMarker, bundleSource: identity.bundleSource, code: identity.code },
      stage: 'failed', firstFailure: { reasonCode, error: { phase: 'native screen boundary',
        name: boundedDiagnosticText(error.name, 80), message: boundedDiagnosticText(error.message), stack: boundedDiagnosticText(error.stack, 2400) } },
    });
  });
  useEffect(() => { rememberFailureSnapshot(record); }, [record]);
  return <Screen>
    <Heading>{PLAYER_TEXT.screenUnavailable}</Heading>
    <Body>ホームへ戻って、もう一度お試しください。</Body>
    <SupportInformation renderDiagnostics={() => record} />
    <ActionButton label="ホームへ戻る" onPress={onExit} />
  </Screen>;
}

class Native3DBoundary extends Component<PropsWithChildren<{ onExit: () => void }>, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <GateFailure reasonCode="NATIVE_SCREEN" error={this.state.error} onExit={this.props.onExit} />;
    return this.props.children;
  }
}

export function NativeFirstPersonGate(props: FirstPersonScreenProps) {
  if (!hasNative3D()) return <GateFailure reasonCode="MISSING_NATIVE_GL" error={new Error('ExpoGL native module is unavailable')} onExit={props.onExit} />;
  return (
    <Native3DBoundary onExit={props.onExit}>
      <Suspense fallback={<Screen><Heading>{PLAYER_TEXT.preparing}</Heading><ActionButton label="ホームへ戻る" onPress={props.onExit} /></Screen>}>
        <FirstPerson {...props} />
      </Suspense>
    </Native3DBoundary>
  );
}
