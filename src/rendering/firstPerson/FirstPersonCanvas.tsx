import { Canvas, useFrame, type RootState } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';

import { CAMERA_FAR, CAMERA_NEAR, VERTICAL_FOV } from '../../domain/firstPerson/chapter';
import type { PreferredColor } from '../IllusionPalette';
import { ChapterScene } from './ChapterScene';
import { createSceneResources } from './resources';
import { advanceController, commandController, controllerSnapshot, recordFrameStats, syncCamera, worldForController, type RuntimeController, type RuntimeSnapshot } from './runtimeController';

export type FirstPersonCanvasProps = {
  controller: RuntimeController;
  snapshot: RuntimeSnapshot;
  paused: boolean;
  neutralColors: boolean;
  preferredColor: PreferredColor;
  effectStrength: 'low' | 'medium' | 'high';
  assist: boolean;
  reducedMotion: boolean;
  quality: 'low' | 'standard';
  onSnapshot: (snapshot: RuntimeSnapshot) => void;
  onReady: () => void;
  onError: (message: string) => void;
};

function FrameDriver({ controller, onSnapshot, onError }: Pick<FirstPersonCanvasProps, 'controller' | 'onSnapshot' | 'onError'>) {
  const lastKey = useRef('');
  const failed = useRef(false);
  useFrame((state, delta) => {
    if (failed.current) return;
    try {
      advanceController(controller, delta, state.camera as THREE.PerspectiveCamera);
      recordFrameStats(controller, delta, state.gl.info);
      const next = controllerSnapshot(controller);
      if (next.key !== lastKey.current) {
        lastKey.current = next.key;
        onSnapshot(next);
      }
    } catch {
      failed.current = true;
      commandController(controller, { type: 'pause' });
      onError('3Dの描画を続けられませんでした。ホームに戻って開き直してください。');
    }
  }, -1);
  return null;
}

export function FirstPersonCanvas(props: FirstPersonCanvasProps) {
  const { controller, snapshot, onReady, onError } = props;
  const resources = useMemo(() => createSceneResources(props.quality === 'low'), [props.quality]);
  // This stable accessor lets the scene read only inside useFrame, never on a worklet.
  const runtime = useMemo(() => ({ get current() { return controller.runtime; } }), [controller]);
  const world = useMemo(() => worldForController({ ...controller, runtime: snapshot.runtime }), [controller, snapshot.runtime]);
  useEffect(() => () => resources.dispose(), [resources]);
  useEffect(() => { resources.updatePalette(props.preferredColor, props.neutralColors, props.effectStrength); }, [props.effectStrength, props.neutralColors, props.preferredColor, resources]);
  const ready = useRef(false);
  useEffect(() => {
    if (props.paused || ready.current) return;
    const timer = setTimeout(() => {
      if (!ready.current) onError('3Dを初期化できませんでした。3D対応の開発版で開き直してください。');
    }, 12000);
    return () => clearTimeout(timer);
  }, [onError, props.paused]);
  const rendererFactory = useMemo(() => async (defaults: Parameters<NonNullable<Extract<React.ComponentProps<typeof Canvas>['gl'], (...args: never[]) => unknown>>>[0]) => {
    try {
      return new THREE.WebGLRenderer({ ...defaults, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'low-power' });
    } catch {
      onError('3D描画を初期化できませんでした。ホームに戻って開き直してください。');
      // Native Canvas 9.7 does not catch its configure promise. The failure
      // screen unmounts this canvas; an unresolved initializer avoids turning
      // this handled failure into an unhandled promise rejection in that code.
      return new Promise<THREE.WebGLRenderer>(() => undefined);
    }
  }, [onError]);
  const handleCreated = (state: RootState) => {
    state.gl.outputColorSpace = THREE.SRGBColorSpace;
    state.gl.toneMapping = THREE.NoToneMapping;
    state.gl.setClearColor('#354342', 1);
    syncCamera(controller, state.camera as THREE.PerspectiveCamera);
    ready.current = true;
    onReady();
  };
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="first-person-native-canvas">
    <Canvas style={styles.canvas} pointerEvents="none" gl={rendererFactory} frameloop={props.paused ? 'never' : 'always'} flat shadows={false} camera={{ fov: VERTICAL_FOV, near: CAMERA_NEAR, far: CAMERA_FAR }} onCreated={handleCreated}>
      <FrameDriver controller={controller} onSnapshot={props.onSnapshot} onError={onError} />
      <ChapterScene world={world} runtime={runtime} progress={snapshot.runtime.progress} resources={resources} assist={props.assist} reducedMotion={props.reducedMotion} lowQuality={props.quality === 'low'} lab={controller.lab} />
    </Canvas>
  </View>;
}
const styles = StyleSheet.create({ canvas: { flex: 1 } });
