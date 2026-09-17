import { Box3, Object3D, Vector3 } from 'three';
import { createInitialRuntime } from '../../../domain/firstPerson/runtime';
import { stageWorld, gateParts, MIRROR_LAYOUT } from '../../../domain/stages/mirror-corridor-v1/definition';
import { createStageSession } from '../../../domain/stages/mirror-corridor-v1/session';
import { StageScene } from '../../../domain/stages/mirror-corridor-v1/scene';
import { createSceneResources } from '../resources';
import { WinchModel } from '../MechanicalDevices';

const mockFrames: { callback: (state: unknown, delta: number) => void; priority: number }[] = [];
jest.mock('@react-three/fiber/native', () => ({ useFrame: (callback: (state: unknown, delta: number) => void, priority = 0) => { mockFrames.push({ callback, priority }); } }));
const { mountThree } = require('../../../../scripts/lib/three-scene-qa.cjs') as {
  mountThree: (element: React.ReactElement, three: typeof import('three')) => Promise<{ objects: Object3D[]; unmount: () => Promise<void> }>;
};
const THREE: typeof import('three') = require('three');
function update(root: Object3D) {
  // The optical GPU pass is exercised separately by the WebGL capture. These
  // callbacks only update the real mechanical meshes and the actor body.
  [...mockFrames].filter(frame => frame.priority !== -.25).sort((a,b) => a.priority-b.priority)
    .forEach(frame => frame.callback({}, 1/60));
  root.updateMatrixWorld(true);
}
function endpoint(mesh: Object3D, side: -1 | 1) { return new Vector3(0,side*.5,0).applyMatrix4(mesh.matrixWorld); }
function named(root: Object3D, name: string) {
  const result = root.getObjectByName(name); if (!result) throw new Error('Missing actual scene object: '+name); return result;
}

beforeEach(() => { mockFrames.length = 0; });
afterEach(() => { mockFrames.length = 0; });

test('practice rope stays attached to the actual weight through a partial lift, completion and release', async () => {
  const resources = createSceneResources(true, null), state = { holding:false,progress:0,ratchets:0,complete:false };
  const mounted = await mountThree(<WinchModel resources={resources} practice state={() => state}/>, THREE), root = new Object3D();
  mounted.objects.forEach(object => root.add(object));
  try {
    const heights: number[] = [];
    for (const step of [{holding:false,progress:0,complete:false},{holding:true,progress:.5,complete:false},
      {holding:true,progress:0,complete:true},{holding:false,progress:0,complete:true}]) {
      Object.assign(state,step); update(root);
      const weight = new Box3().setFromObject(named(root,'practice-visible-weight'));
      const rope = named(root,'practice-pulley-to-weight');
      expect(endpoint(rope,1).distanceTo(new Vector3(weight.getCenter(new Vector3()).x,weight.max.y,weight.getCenter(new Vector3()).z))).toBeLessThan(1e-6);
      expect(endpoint(rope,-1).distanceTo(new Vector3(-.22,.3,-.4))).toBeLessThan(1e-6);
      heights.push(weight.min.y);
    }
    const rest = new Box3().setFromObject(named(root,'practice-weight-stop'));
    expect(heights[0]).toBeCloseTo(rest.max.y,6);
    expect(heights[1]! - heights[0]!).toBeGreaterThan(.1);
    expect(heights[2]! - heights[0]!).toBeCloseTo(.3,6);
    expect(heights[3]).toBe(heights[2]);
  } finally { await mounted.unmount(); resources.dispose(); }
});

test('rendered grate steel matches collision/LOS parts and its lift cable stays attached at every opening height', async () => {
  const resources = createSceneResources(true,null,true), runtime = { current:createInitialRuntime(undefined,undefined,'mirror-corridor-v1') };
  const state = createStageSession('mechanism-geometry'); state.keyTaken=true; state.practiced=true;
  runtime.current.stageSession = { stageId:'mirror-corridor-v1',value:state };
  const mounted = await mountThree(<StageScene world={stageWorld(0)} resources={resources} runtime={runtime}/>,THREE), root = new Object3D();
  mounted.objects.forEach(object => root.add(object));
  try {
    const grate = named(root,'isolation-grate'); expect(grate.type).toBe('Group');
    const inner = named(root,'winch-drum-to-outlet'), outer = named(root,'winch-to-grate-continuous-cable');
    for (const [ratchets,lift] of [[0,0],[1,.45],[1,.9],[2,1.4],[2,1.8],[3,2.2],[3,3.6]]) {
      state.ratchets=ratchets!; state.gateLift=lift!; update(root);
      expect(endpoint(inner.children.at(-1)!,1).distanceTo(endpoint(outer.children[0]!,-1))).toBeLessThan(1e-6);
      for (const part of gateParts(lift!)) {
        const bounds = new Box3().setFromObject(named(root,part.id));
        expect(bounds.min.distanceTo(new Vector3(part.min.x,part.min.y,part.min.z))).toBeLessThan(1e-6);
        expect(bounds.max.distanceTo(new Vector3(part.max.x,part.max.y,part.max.z))).toBeLessThan(1e-6);
      }
      const cable = named(root,'grate-moving-lift-cable'), attachment = new Box3().setFromObject(named(root,'grate-cable-attachment'));
      expect(attachment.expandByScalar(1e-6).containsPoint(endpoint(cable,1))).toBe(true);
      expect(endpoint(cable,-1).y).toBeCloseTo(MIRROR_LAYOUT.gate.pulleyY,6);
      expect(stageWorld(ratchets!,true,true,null,undefined,lift).solids.find(solid => solid.id==='isolation-grate')?.opaque).toBe(false);
    }
    state.ratchets=2; state.gateLift=1.8; state.holding='winch'; state.holdSeconds=1; update(root);
    const settled = [1,2].map(n => named(root,'physical-ratchet-'+n).matrix.clone());
    state.holding=null; state.holdSeconds=0; update(root);
    settled.forEach((matrix,i) => expect(named(root,'physical-ratchet-'+(i+1)).matrix.equals(matrix)).toBe(true));
    expect(named(root,'control-vestibule-door').children.length).toBeGreaterThan(0);
  } finally { await mounted.unmount(); resources.dispose(); }
});
