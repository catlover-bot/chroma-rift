import { theatreProjectorStatus, theatreTargetLabel } from './deviceStatus';
import { THEATRE_BELLS, THEATRE_SHUTTER } from './environment';
import type { ChapterRuntime, CollisionVolume, WorldGeometry } from '../firstPerson/types';
import { THEATRE_AMES_SIDE_FIXTURE, THEATRE_BYPASS_FIXTURE, THEATRE_CHAPTER_ID, THEATRE_CURTAIN, THEATRE_CURTAIN_FIXTURE, THEATRE_FLOORS, THEATRE_INSPECTION_FIXTURE, THEATRE_LIGHT_FIXTURE, THEATRE_PROJECTOR_FIXTURE, THEATRE_SPAWN, theatreTarget } from './definition';
export const theatreBox = (id:string,minX:number,maxX:number,minZ:number,maxZ:number,minY=0,maxY=3.5,kind:CollisionVolume['kind']='wall',opaque=true):CollisionVolume => ({ id,min:{ x:minX,y:minY,z:minZ },max:{ x:maxX,y:maxY,z:maxZ },kind,opaque });
const B=theatreBox;
export const THEATRE_STATIC_SOLIDS: readonly CollisionVolume[] = [
  B('theatre-entry-back',-4.12,4.12,-5.22,-5.1),B('theatre-east-wall',4,4.12,-5.1,18.7),
  B('theatre-west-work-wall',-4.12,-4,-5.1,5.4),B('theatre-work-divider-left',-4,1.05,3.94,4.06),B('theatre-work-divider-right',2.95,4,3.94,4.06),B('theatre-work-safe-jamb-left',1.05,1.62,3.88,4.15),B('theatre-work-safe-jamb-right',2.38,2.95,3.88,4.15),
  B('theatre-light-rail-body',-2.5,-.3,-.82,.82,.96,1.34,'device',false),
  B('theatre-coat-stand',-1.64,-1.16,1.045,1.155,0,1.54,'device',false),
  B('theatre-receiver-body',-2.73,-.07,3.3,3.38,.65,2.64,'device'),
  B('theatre-bell-a-receiver',2.72,2.88,10.02,10.18,2.52,2.84,'device',false),
  B('theatre-bell-b-receiver',-2.88,-2.72,16.02,16.18,2.52,2.84,'device',false),
  B('theatre-central-divider',-1.1,1.1,8,13,0,2.65),
  B('theatre-crossing-screen',3.45,4,7.08,7.22,0,2.7),
  B('theatre-west-loop-wall',-4.12,-4,10.7,14.4),B('theatre-projector-middle-jamb',-4.12,-4,15.1,16.2),B('theatre-projector-north-jamb',-4.12,-4,16.9,18.7),
  B('theatre-ames-front-south',-5.72,-4,5.28,5.4),B('theatre-ames-front-jamb-south',-5.72,-5.6,5.4,6.35),B('theatre-ames-front-jamb-north',-5.72,-5.6,7.65,8.8),B('theatre-ames-front-sill',-5.72,-5.6,6.35,7.65,0,.42),B('theatre-ames-front-lintel',-5.72,-5.6,6.35,7.65,2.85,3.5),
  B('theatre-ames-side-west',-12.12,-12,8.7,10.82),B('theatre-ames-side-jamb-west',-12,-11.85,8.68,8.8),B('theatre-ames-side-jamb-east',-6.6,-5.6,8.68,8.8),B('theatre-ames-side-sill',-11.85,-6.6,8.68,8.8,0,.08),B('theatre-ames-side-lintel',-11.85,-6.6,8.68,8.8,3.45,3.5),
  B('theatre-ames-side-north-west',-12,-5.58,10.7,10.82),B('theatre-ames-side-north-east',-4.82,-4,10.7,10.82),
  B('theatre-ames-exhibit-volume',-11.7,-6.55,6.2,8.55,0,3.5,'device',false),
  B('theatre-maintenance-west',-5.9,-5.58,10.82,14),B('theatre-maintenance-east',-4.82,-4,10.82,14),
  B('theatre-projector-west',-6.02,-5.9,14,17.2),B('theatre-projector-north',-5.9,-4,17.2,17.32),
  B('theatre-projector-body',-5.76,-4.98,15.82,16.35,0,1.7,'device'),
  B('theatre-main-end-left',-4,-2,18.58,18.7),B('theatre-main-end-right',2,4,18.58,18.7),
  B('theatre-booth-west',-2.12,-2,18.7,24.62),B('theatre-booth-east',2,2.12,18.7,24.62),B('theatre-outside-end',-2,2,24.5,24.62),
  B('theatre-booth-safe-left',-2,-.38,18.55,18.7),B('theatre-booth-safe-right',.38,2,18.55,18.7),
];
let cache: { key:string; world:WorldGeometry } | undefined;
export function getTheatreWorld(runtime:Pick<ChapterRuntime,'progress'|'theatre'>):WorldGeometry {
  const p=runtime.progress.theatre!,v=runtime.theatre!, actor=v.actor;
  const key=[v.lightGateOpen,p.light.accepted,p.inspectionShutterOpen,p.bypassOpen,p.curtainAccepted,p.passageSealed,v.curtainOpenness,v.environment.shutter.closed,v.environment.shutter.progress,theatreProjectorStatus(runtime).key,actor.visible,actor.motion.position.x,actor.motion.position.z].join('/');
  if (cache?.key===key) return cache.world;
  const solids:CollisionVolume[]=[...THEATRE_STATIC_SOLIDS,
    B('theatre-light-gate',1.05,2.95,3.95,4.05,3.6*v.lightGateOpen,3.3+3.6*v.lightGateOpen,'door'),
    B('theatre-inspection-shutter',-11.88,-6.57,8.57,8.63,p.inspectionShutterOpen?3.6:0,p.inspectionShutterOpen?7.1:3.5,'door'),
    B('theatre-service-handle-cover',-5.5,-4.7,10.52,10.58,.85+(p.inspectionShutterOpen?1.05:0),1.75+(p.inspectionShutterOpen?1.05:0),'door'),
    B('theatre-bypass-gate',-5.58,-4.82,10.7,10.82,p.bypassOpen?3.6:0,p.bypassOpen?6.9:3.3,'door'),
    B('theatre-fire-curtain',THEATRE_CURTAIN.minX,THEATRE_CURTAIN.maxX,THEATRE_CURTAIN.z-THEATRE_CURTAIN.depth/2,THEATRE_CURTAIN.z+THEATRE_CURTAIN.depth/2,THEATRE_CURTAIN.height*v.curtainOpenness,THEATRE_CURTAIN.height*(1+v.curtainOpenness),'door'),
    B('theatre-manual-shutter',THEATRE_SHUTTER.minX,THEATRE_SHUTTER.maxX,THEATRE_SHUTTER.z-.07,THEATRE_SHUTTER.z+.07,THEATRE_SHUTTER.height*(1-v.environment.shutter.progress),THEATRE_SHUTTER.height*(2-v.environment.shutter.progress),'door')];
  if(actor.visible)solids.push(B('theatre-actor-body',actor.motion.position.x-.44,actor.motion.position.x+.44,actor.motion.position.z-.44,actor.motion.position.z+.44,0,2.22,'device',false));
  const interactables=[theatreTarget('theatre-light',theatreTargetLabel('theatre-light',runtime),THEATRE_LIGHT_FIXTURE),theatreTarget('theatre-inspection',theatreTargetLabel('theatre-inspection',runtime),THEATRE_INSPECTION_FIXTURE),theatreTarget('theatre-projector',theatreTargetLabel('theatre-projector',runtime),THEATRE_PROJECTOR_FIXTURE),theatreTarget('theatre-curtain',theatreTargetLabel('theatre-curtain',runtime),THEATRE_CURTAIN_FIXTURE)];
  if(p.inspectionShutterOpen)interactables.push(theatreTarget('theatre-ames-side',theatreTargetLabel('theatre-ames-side',runtime),THEATRE_AMES_SIDE_FIXTURE),theatreTarget('theatre-bypass',theatreTargetLabel('theatre-bypass',runtime),THEATRE_BYPASS_FIXTURE));
  if(p.light.accepted){
    for(const bell of THEATRE_BELLS)interactables.push(theatreTarget(bell.instanceId,bell.label,bell.fixture));
    interactables.push(theatreTarget('theatre-shutter-south',v.environment.shutter.closed?'仕切りを上げる':'仕切りを下ろす',THEATRE_SHUTTER.handles[0]!),
      theatreTarget('theatre-shutter-north',v.environment.shutter.closed?'仕切りを上げる':'仕切りを下ろす',THEATRE_SHUTTER.handles[1]!));
  }
  const world:WorldGeometry={ chapterId:THEATRE_CHAPTER_ID,variant:'entrance',floors:THEATRE_FLOORS,solids,interactables,colorPanels:[],keyObservationPose:THEATRE_SPAWN,keyFragments:[],keyFrame:{ center:{ x:0,y:0,z:0 },width:0,height:0,outline:[] } };
  cache={key,world};return world;
}
