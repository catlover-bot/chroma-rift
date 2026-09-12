import type { ChapterRuntime, WorldGeometry } from '../../domain/firstPerson/types';
import type { StageId } from '../../domain/stageKit/definitions';
import { StageScene as StageKitProbeScene } from '../../domain/stages/stage-kit-probe/scene';
import { StageScene as MirrorCorridorScene } from '../../domain/stages/mirror-corridor-v1/scene';
import { StageScene as DepartureControlScene } from '../../domain/stages/departure-control-v1/scene';
import type { SceneResources } from './resources';
import type { RefObject } from 'react';
import type { OffscreenDraw } from './planarMirror';

export type StageRenderOffscreen = OffscreenDraw;
type SceneBinding = (props: { world: WorldGeometry; resources: SceneResources; runtime: RefObject<ChapterRuntime>;
  renderOffscreen?: StageRenderOffscreen | undefined; onFrameError?: ((error: unknown) => void) | undefined }) => React.JSX.Element;
/** Static render composition. Scenes borrow the existing Canvas and resources. */
export const STAGE_SCENE_BINDINGS: Partial<Record<StageId, SceneBinding>> = {
  ...(typeof __DEV__ === 'undefined' || __DEV__ ? { 'stage-kit-probe': StageKitProbeScene } : {}),
  'mirror-corridor-v1': MirrorCorridorScene,
  'departure-control-v1': DepartureControlScene,
};
