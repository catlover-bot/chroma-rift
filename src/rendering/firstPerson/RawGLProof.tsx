import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { recordCanvasLayout, recordDiagnosticError, type FirstPersonDiagnostics } from './diagnostics';
import { drawRawGLProof } from './rawGLTriangle';

/** Mount separately from FirstPersonCanvas. GLView owns/destroys its native
 * view context; we delete the shaders/program/buffer that this proof owns. */
export function RawGLProof({ diagnostics, appActive, onComplete, onError }: {
  diagnostics: FirstPersonDiagnostics; appActive: boolean;
  onComplete?: () => void; onError?: (message: string) => void;
}) {
  const mounted = useRef(true);
  const active = useRef(appActive);
  const context = useRef<ExpoWebGLRenderingContext | undefined>(undefined);
  const drawn = useRef(false);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const startupRemaining = useRef(12000);
  const run = useCallback(() => {
    if (!__DEV__ || !mounted.current || !active.current || !context.current || drawn.current) return;
    drawn.current = true;
    try { cleanup.current = drawRawGLProof(context.current, diagnostics); onComplete?.(); }
    catch { onError?.('GLの確認描画に失敗しました。診断記録を確認してください。'); }
  }, [diagnostics, onComplete, onError]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cleanup.current?.(); if (diagnostics.stage !== 'failed') diagnostics.stage = 'closed'; diagnostics.rendererOwnership = 'closed'; };
  }, [diagnostics]);
  useLayoutEffect(() => { active.current = appActive; if (appActive) run(); }, [appActive, run]);
  useEffect(() => {
    if (!__DEV__ || !appActive || drawn.current) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      if (!mounted.current || drawn.current) return;
      drawn.current = true;
      diagnostics.stage = 'failed';
      recordDiagnosticError(diagnostics, new Error('Raw GL proof context did not arrive before the active startup deadline'), 'raw-gl-proof-timeout');
      onError?.('GLの確認を開始できませんでした。診断記録を確認してください。');
    }, startupRemaining.current);
    return () => { clearTimeout(timer); startupRemaining.current = Math.max(0, startupRemaining.current - (Date.now() - startedAt)); };
  }, [appActive, diagnostics, onError]);
  if (!__DEV__) return null;
  return <View testID="raw-gl-proof" style={StyleSheet.absoluteFill} onLayout={(event) => recordCanvasLayout(diagnostics, event.nativeEvent.layout.width, event.nativeEvent.layout.height)}>
    <GLView style={StyleSheet.absoluteFill} msaaSamples={0} onContextCreate={(gl) => {
      if (!mounted.current) return;
      // A new context belongs to a new proof mount; never draw twice against a
      // replaced context while the preceding GLView is still being removed.
      if (context.current && context.current !== gl) return;
      context.current = gl; run();
    }} />
  </View>;
}
