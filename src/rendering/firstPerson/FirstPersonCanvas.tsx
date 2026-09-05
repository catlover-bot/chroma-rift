import { Canvas, useFrame, type RootState } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';

import { CAMERA_FAR, CAMERA_NEAR, VERTICAL_FOV } from '../../domain/firstPerson/chapter';
import type { PreferredColor } from '../IllusionPalette';
import { CanvasFailureBoundary } from './CanvasFailureBoundary';
import { createCanvasLifecycle, type CanvasLifecycle } from './canvasLifecycle';
import { ChapterScene } from './ChapterScene';
import { createSceneResources } from './resources';
import { advanceController, controllerSnapshot, recordFrameStats, syncCamera, worldForController, type RuntimeController, type RuntimeSnapshot } from './runtimeController';

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

/** R3F's custom-renderer protocol, used only after initialization has failed.
 * configure needs render/setSize/setPixelRatio; native onCreated additionally
 * wraps getContext().endFrameEXP. It owns no context and never draws a frame. */
function createTeardownOnlyRenderer() {
  return {
    render() {}, setSize() {}, setPixelRatio() {}, dispose() {},
    getContext: () => ({ endFrameEXP() {} }),
  };
}

function FrameDriver({ controller, onSnapshot, lifecycle }: Pick<FirstPersonCanvasProps, 'controller' | 'onSnapshot'> & { lifecycle: CanvasLifecycle }) {
  const lastKey = useRef('');
  useFrame((state, delta) => {
    if (!lifecycle.active) return;
    try {
      advanceController(controller, delta, state.camera as THREE.PerspectiveCamera);
      recordFrameStats(controller, delta, state.gl.info);
      const next = controllerSnapshot(controller);
      if (next.key !== lastKey.current) {
        lastKey.current = next.key;
        onSnapshot(next);
      }
    } catch (error) {
      lifecycle.fail(error, 'simulation frame');
    }
  }, -1);
  return null;
}

export function FirstPersonCanvas(props: FirstPersonCanvasProps) {
  const { controller, snapshot, onReady, onError } = props;
  const lifecycle = useMemo(() => createCanvasLifecycle(controller, onError), [controller, onError]);
  const resources = useMemo(() => createSceneResources(props.quality === 'low'), [props.quality]);
  // This stable accessor lets the scene read only inside useFrame, never on a worklet.
  const runtime = useMemo(() => ({ get current() { return controller.runtime; } }), [controller]);
  const world = useMemo(() => worldForController({ ...controller, runtime: snapshot.runtime }), [controller, snapshot.runtime]);
  useEffect(() => () => resources.dispose(), [resources]);
  useEffect(() => () => lifecycle.close(), [lifecycle]);
  useEffect(() => { resources.updatePalette(props.preferredColor, props.neutralColors, props.effectStrength); }, [props.effectStrength, props.neutralColors, props.preferredColor, resources]);
  useEffect(() => {
    if (props.paused || lifecycle.ready || !lifecycle.active) return;
    const timer = setTimeout(() => {
      if (!lifecycle.ready) lifecycle.fail(new Error('Native canvas did not become ready within 12 seconds'), 'initialization timeout');
    }, 12000);
    return () => clearTimeout(timer);
  }, [lifecycle, props.paused]);
  const rendererFactory = useMemo(() => (defaults: Parameters<NonNullable<Extract<React.ComponentProps<typeof Canvas>['gl'], (...args: never[]) => unknown>>>[0]) => {
    try {
      const renderer = new THREE.WebGLRenderer({ ...defaults, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'low-power' });
      lifecycle.ownRenderer(renderer);
      return renderer;
    } catch (error) {
      lifecycle.fail(error, 'renderer initialization');
      // Native Canvas 9.7 has no configure rejection handler. A pending promise
      // also prevents scene creation and leaks its root during cleanup. Complete
      // only the supported custom-renderer protocol so R3F can unmount normally.
      // The failed lifecycle disables every frame and onReady; this renderer
      // never provides a playable fallback and owns no GL/GPU resources.
      return createTeardownOnlyRenderer();
    }
  }, [lifecycle]);
  const handleCreated = (state: RootState) => {
    if (!lifecycle.attachRoot(state)) return;
    try {
      // Native Canvas has already installed endFrameEXP here. Preserve that
      // wrapper while handling errors outside React's render/commit boundary.
      const renderFrame = state.gl.render.bind(state.gl);
      state.gl.render = (scene, camera) => {
        if (!lifecycle.active) return;
        try { renderFrame(scene, camera); }
        catch (error) { lifecycle.fail(error, 'render'); }
      };
      state.gl.outputColorSpace = THREE.SRGBColorSpace;
      state.gl.toneMapping = THREE.NoToneMapping;
      state.gl.setClearColor('#354342', 1);
      syncCamera(controller, state.camera as THREE.PerspectiveCamera);
      if (lifecycle.markReady()) onReady();
    } catch (error) { lifecycle.fail(error, 'scene initialization'); }
  };
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="first-person-native-canvas">
    <CanvasFailureBoundary lifecycle={lifecycle}>
      <Canvas style={styles.canvas} pointerEvents="none" gl={rendererFactory} frameloop={props.paused ? 'never' : 'always'} flat shadows={false} camera={{ fov: VERTICAL_FOV, near: CAMERA_NEAR, far: CAMERA_FAR }} onCreated={handleCreated}>
        <FrameDriver controller={controller} onSnapshot={props.onSnapshot} lifecycle={lifecycle} />
        <ChapterScene world={world} runtime={runtime} progress={snapshot.runtime.progress} resources={resources} assist={props.assist} reducedMotion={props.reducedMotion} lowQuality={props.quality === 'low'} lab={controller.lab} onFrameError={(error) => lifecycle.fail(error, 'scene frame')} />
      </Canvas>
    </CanvasFailureBoundary>
  </View>;
}
const styles = StyleSheet.create({ canvas: { flex: 1 } });
