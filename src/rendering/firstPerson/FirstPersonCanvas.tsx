import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PaletteId } from '../../domain/emblem';
import { CAMERA_FAR, CAMERA_NEAR, VERTICAL_FOV } from '../../domain/firstPerson/chapter';
import { hasNative3D } from '../../platform/native3D';
import type { PreferredColor } from '../IllusionPalette';
import { CanvasFailureBoundary } from './CanvasFailureBoundary';
import { createCanvasLifecycle, type CanvasLifecycle } from './canvasLifecycle';
import { NotebookMaskScene } from './NotebookMaskScene';
import { ChapterScene } from './ChapterScene';
import { recordCanvasLayout, updateDiagnosticEnvironment } from './diagnostics';
import { createNativeSceneSession, type NativeSceneSession } from './nativeSceneSession';
import { PROOF_CAMERA, ProofScene } from './ProofScene';
import { createSceneResources } from './resources';
import { DEFAULT_EMBLEM_APPEARANCE } from './emblemSurface';
import { stopController } from './runtimeController';
import { worldForController } from './controllerContext';
import type { RuntimeController, RuntimeSnapshot } from './controllerTypes';

export type FirstPersonCanvasProps = {
  controller: RuntimeController; snapshot: RuntimeSnapshot; paused: boolean; appActive?: boolean;
  sceneMode?: 'chapter' | 'proof'; startupTimeoutMs?: number;
  neutralColors: boolean; preferredColor: PreferredColor; effectStrength: 'low' | 'medium' | 'high';
  emblemPalette?: PaletteId;
  assist: boolean; reducedMotion: boolean; quality: 'low' | 'standard';
  onSnapshot: (snapshot: RuntimeSnapshot) => void; onReady: () => void; onError: (message: string) => void;
};

function FrameDriver({ onSnapshot, lifecycle, session }: {
  onSnapshot: FirstPersonCanvasProps['onSnapshot']; lifecycle: CanvasLifecycle; session: NativeSceneSession;
}) {
  const scene = useThree((state) => state.scene);
  useLayoutEffect(() => { lifecycle.commitScene(); }, [lifecycle, scene]);
  useFrame((state, delta) => session.step(state, delta, onSnapshot), -1);
  // Negative priority retains the installed R3F automatic render owner.
  return null;
}

export function FirstPersonCanvas(props: FirstPersonCanvasProps) {
  const { controller, snapshot, onReady, onError, appActive = true } = props;
  const proof = props.sceneMode === 'proof' && __DEV__;
  const lifecycle = useMemo(() => createCanvasLifecycle(controller, onError), [controller, onError]);
  const session = useMemo(() => createNativeSceneSession(controller, lifecycle, proof, onReady), [controller, lifecycle, proof, onReady]);
  const resources = useMemo(() => proof ? undefined : createSceneResources(props.quality === 'low', controller.lab || controller.runtime.gallery || controller.runtime.vault || controller.runtime.theatre ? null : { ...DEFAULT_EMBLEM_APPEARANCE, seed: controller.runtime.emblem.seed }, !!controller.runtime.gallery || !!controller.runtime.vault || !!controller.runtime.theatre, !!controller.runtime.vault, !!controller.runtime.theatre), [controller, proof, props.quality]);
  const runtime = useMemo(() => ({ get current() { return controller.runtime; } }), [controller]);
  const world = useMemo(() => worldForController({ ...controller, runtime: snapshot.runtime }), [controller, snapshot.runtime]);
  const remainingStartup = useRef(props.startupTimeoutMs ?? 12000);
  const options = useMemo(() => proof ? PROOF_CAMERA : { fov: VERTICAL_FOV, near: CAMERA_NEAR, far: CAMERA_FAR }, [proof]);

  useLayoutEffect(() => {
    updateDiagnosticEnvironment(controller.diagnostics, { sceneMode: proof ? 'proof' : controller.lab ? 'lab' : 'chapter',
      appActive, paused: props.paused, nativeGL: hasNative3D() });
    if (props.paused || !appActive) stopController(controller);
  }, [controller, appActive, props.paused, proof]);
  useEffect(() => () => resources?.dispose(), [resources]);
  useEffect(() => () => session.close(), [session]);
  useLayoutEffect(() => {
    resources?.emblemSurface?.update({
      seed: snapshot.runtime.emblem.seed,
      palette: props.emblemPalette ?? 'baseline',
      preference: props.preferredColor === 'neutral' ? 'unknown' : props.preferredColor,
      presentation: snapshot.runtime.emblem.presentation,
      assist: snapshot.runtime.emblem.assist,
    });
  }, [props.emblemPalette, props.preferredColor, resources, snapshot.runtime.emblem.seed, snapshot.runtime.emblem.presentation, snapshot.runtime.emblem.assist]);
  useLayoutEffect(() => {
    resources?.galleryResources?.chromaticSurface.update(snapshot.runtime.gallery?.chromaticNeutral ?? false, props.emblemPalette ?? 'baseline');
  }, [props.emblemPalette, resources, snapshot.runtime.gallery?.chromaticNeutral]);
  useEffect(() => { resources?.updatePalette(props.preferredColor, props.neutralColors, props.effectStrength); }, [props.effectStrength, props.neutralColors, props.preferredColor, resources]);
  useEffect(() => {
    if (props.paused || !appActive || lifecycle.ready || !lifecycle.active) return;
    const start = Date.now();
    const timer = setTimeout(() => {
      if (!lifecycle.ready) lifecycle.fail(new Error('No valid completed native frame before the active startup deadline'), 'initialization timeout');
    }, remainingStartup.current);
    return () => {
      clearTimeout(timer);
      remainingStartup.current = Math.max(0, remainingStartup.current - (Date.now() - start));
    };
  }, [lifecycle, props.paused, appActive]);

  return <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="first-person-native-canvas"
    onLayout={(event) => recordCanvasLayout(controller.diagnostics, event.nativeEvent.layout.width, event.nativeEvent.layout.height)}>
    <CanvasFailureBoundary lifecycle={lifecycle}>
      <Canvas style={styles.canvas} pointerEvents="none" gl={session.factory}
        frameloop={!appActive || props.paused && !controller.notebookPreview ? 'never' : 'always'} flat shadows={false} camera={options} onCreated={session.created}>
        <FrameDriver onSnapshot={props.onSnapshot} lifecycle={lifecycle} session={session} />
        {proof ? <ProofScene /> : controller.notebookPreview && resources?.galleryResources ? <NotebookMaskScene resources={resources} /> : <ChapterScene world={world} runtime={runtime} progress={snapshot.runtime.progress} resources={resources!}
          assist={props.assist} reducedMotion={props.reducedMotion} lowQuality={props.quality === 'low'} lab={controller.lab}
          onFrameError={session.sceneError} />}
      </Canvas>
    </CanvasFailureBoundary>
  </View>;
}
const styles = StyleSheet.create({ canvas: { flex: 1 } });
