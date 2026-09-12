import type { WorldGeometry } from '../../domain/firstPerson/types';
import type { StageId } from '../../domain/stageKit/definitions';
import { StageScene as StageKitProbeScene } from '../../domain/stages/stage-kit-probe/scene';
import type { SceneResources } from './resources';

type SceneBinding = (props: { world: WorldGeometry; resources: SceneResources }) => React.JSX.Element;
/** Static render composition. Scenes borrow the existing Canvas and resources. */
export const STAGE_SCENE_BINDINGS: Partial<Record<StageId, SceneBinding>> = {
  'stage-kit-probe': StageKitProbeScene,
};
