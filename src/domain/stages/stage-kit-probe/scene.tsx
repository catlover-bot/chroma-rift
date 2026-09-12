/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import type { WorldGeometry } from '../../firstPerson/types';
import type { SceneResources } from '../../../rendering/firstPerson/resources';
/** Dev-only scene. The host owns its Canvas, renderer and shared resources. */
export function StageScene({world,resources}:{world:WorldGeometry<string>;resources:SceneResources}){
  return <group name="stage-kit-probe" dispose={null}><ambientLight intensity={1.4}/>
    {world.floors.map(f=><mesh key={f.id} geometry={resources.box} material={resources.floor} position={[(f.minX+f.maxX)/2,-.1,(f.minZ+f.maxZ)/2]} scale={[f.maxX-f.minX,.2,f.maxZ-f.minZ]}/>)}
    {world.solids.map(s=><mesh key={s.id} geometry={resources.box} material={s.kind==='door'?resources.door:resources.wall} position={[(s.min.x+s.max.x)/2,(s.min.y+s.max.y)/2,(s.min.z+s.max.z)/2]} scale={[s.max.x-s.min.x,s.max.y-s.min.y,s.max.z-s.min.z]}/>)}
    {world.interactables.map(t=><mesh key={t.id} geometry={resources.box} material={resources.device} position={[t.center.x,t.center.y,t.center.z]} scale={[.2,.2,.1]}/>)}
  </group>;
}
