import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import { Box3, Group, Mesh, Vector3 } from 'three';
import { createInitialRuntime } from '../../firstPerson/runtime';
import { createSceneResources } from '../../../rendering/firstPerson/resources';
import { CONTAINMENT_DOOR_PARTS } from './containmentDoor';
import { createStageSession } from './session';
import { stageWorld } from './definition';
import { StageScene } from './scene';

const mockFrames: ((state: unknown, delta: number) => void)[] = [];
jest.mock('@react-three/fiber/native', () => ({ useFrame: (callback: (state: unknown, delta: number) => void) => { mockFrames.push(callback); } }));

test('the actual scene meshes and moving opaque volumes share bounds without drawing the body-only slab', async () => {
  const resources = createSceneResources(false, null, true);
  const runtime = { current: createInitialRuntime(undefined, undefined, 'departure-control-v1') };
  const session = createStageSession('door-scene');
  runtime.current.stageSession = { stageId: 'departure-control-v1', value: session };
  let tree: ReactTestRenderer | undefined;
  const nodes = new Map<string, Group>();
  mockFrames.length = 0;
  try {
    await act(async () => {
      tree = create(<StageScene world={stageWorld()} resources={resources} runtime={runtime}/>, {
        createNodeMock: element => {
          if (element.type !== 'group') return null;
          const group = new Group();
          const props = element.props;
          if (props && typeof props === 'object') {
            if ('position' in props && Array.isArray(props.position)) group.position.fromArray(props.position);
            if ('name' in props && typeof props.name === 'string') nodes.set(props.name, group);
          }
          return group;
        },
      });
    });
    const door = tree!.root.findByProps({ name: 'containment-door' }), moving = nodes.get('containment-door')!;
    expect(door.findAllByType('mesh')).toHaveLength(CONTAINMENT_DOOR_PARTS.length);
    const rendered = door.findAllByType('mesh').map(element => {
      const mesh = new Mesh(element.props.geometry, element.props.material);
      mesh.name = element.props.name;
      mesh.position.fromArray(element.props.position); mesh.scale.fromArray(element.props.scale);
      moving.add(mesh); return mesh;
    });
    for (const progress of [0, .25, .5, .75, .95, 1]) {
      session.doorProgress = progress;
      mockFrames.forEach(callback => callback({}, 1 / 60));
      moving.updateMatrixWorld(true);
      const world = stageWorld(progress), slab = world.solids.find(solid => solid.id === 'containment-door')!;
      expect(slab.opaque).toBe(false);
      for (const mesh of rendered) {
        const bounds = new Box3().setFromObject(mesh), solid = world.solids.find(candidate => candidate.id === mesh.name);
        if (mesh.name.endsWith('observation-pane')) { expect(solid).toBeUndefined(); continue; }
        expect(solid?.opaque).toBe(true);
        expect(bounds.min.distanceTo(new Vector3(solid!.min.x, solid!.min.y, solid!.min.z))).toBeLessThan(1e-6);
        expect(bounds.max.distanceTo(new Vector3(solid!.max.x, solid!.max.y, solid!.max.z))).toBeLessThan(1e-6);
        for (const axis of ['x', 'y', 'z'] as const) {
          expect(bounds.min[axis]).toBeGreaterThanOrEqual(slab.min[axis] - 1e-6);
          expect(bounds.max[axis]).toBeLessThanOrEqual(slab.max[axis] + 1e-6);
        }
      }
    }
  } finally {
    if (tree) await act(async () => tree!.unmount());
    resources.dispose(); mockFrames.length = 0;
  }
});
