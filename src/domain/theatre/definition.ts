import type { FloorRegion, InteractableDefinition, PlayerPose, Vec3 } from '../firstPerson/types';
import type { PanelSurface } from '../firstPerson/panelFixture';
import { LIGHT_SPEC, opticalWorldPoint, lightSource } from './lightGate';
import type { TheatreCheckpointId } from './types';
export const THEATRE_CHAPTER_ID = 'shadow-theatre-v1';
export const THEATRE_LEVEL_VERSION = 1;
export const THEATRE_SPEC_VERSION = 1;
export const THEATRE_SEED = 151;
export const THEATRE_SPAWN: PlayerPose = { position: { x:-1.4,y:1.6,z:-4.3 },yaw:Math.PI,pitch:0 };
const n = Math.hypot(1.5,1.2);
export const THEATRE_LIGHT_FIXTURE: PanelSurface = { center:opticalWorldPoint(lightSource(0)),width:2.44,height:.8,normal:{ x:1.2/n,y:0,z:-1.5/n },right:{ x:-1.5/n,y:0,z:-1.2/n },maxDistance:5.4 };
export const THEATRE_INSPECTION_FIXTURE: PanelSurface = { center:{ x:-4.22,y:1.3,z:8.4 },width:.46,height:.7,normal:{ x:1,y:0,z:0 },right:{ x:0,y:0,z:-1 },maxDistance:3.2 };
export const THEATRE_AMES_SIDE_FIXTURE: PanelSurface = { center:{ x:-10.3,y:1.7,z:8.53 },width:2.8,height:2.3,normal:{ x:0,y:0,z:1 },right:{ x:1,y:0,z:0 },maxDistance:4.5 };
export const THEATRE_BYPASS_FIXTURE: PanelSurface = { center:{ x:-5.1,y:1.3,z:10.62 },width:.6,height:.8,normal:{ x:0,y:0,z:-1 },right:{ x:-1,y:0,z:0 },maxDistance:2.9 };
export const THEATRE_PROJECTOR_FIXTURE: PanelSurface = { center:{ x:-5.37,y:1.3,z:15.8 },width:.74,height:.74,normal:{ x:0,y:0,z:-1 },right:{ x:-1,y:0,z:0 },maxDistance:2.8 };
export const THEATRE_CURTAIN_FIXTURE: PanelSurface = { center:{ x:1.04,y:1.3,z:19.18 },width:.62,height:.88,normal:{ x:0,y:0,z:1 },right:{ x:1,y:0,z:0 },maxDistance:3.5 };
export const THEATRE_CURTAIN = { minX:-1.4,maxX:1.4,z:18.9,depth:.12,height:3.2,duration:1.05 } as const;
export const THEATRE_PROJECTOR = { position:{ ...THEATRE_PROJECTOR_FIXTURE.center },crankRadius:.23,hitRadius:.22,minimumTravel:Math.PI*.8,duration:5,cooldown:1.2,pulseInterval:1,strength:1.12 } as const;
export const THEATRE_CHECKPOINTS: Record<TheatreCheckpointId,PlayerPose> = {
  entry:THEATRE_SPAWN,
  projector:{ position:{ x:-5.37,y:1.6,z:14.38 },yaw:Math.PI,pitch:-.2082 },
  booth:{ position:{ x:0,y:1.6,z:21.3 },yaw:0,pitch:0 },
  exit:{ position:{ x:0,y:1.6,z:23.6 },yaw:Math.PI,pitch:0 },
};
export const THEATRE_FLOORS: readonly FloorRegion[] = [
  { id:'theatre-work-bay',minX:-4,maxX:4,minZ:-5.1,maxZ:4 },
  { id:'theatre-loop',minX:-4,maxX:4,minZ:4,maxZ:18.7 },
  { id:'theatre-ames-front-walk',minX:-5.6,maxX:-3.5,minZ:5.4,maxZ:10.7 },
  { id:'theatre-ames-side-walk',minX:-12,maxX:-4,minZ:8.8,maxZ:10.7 },
  { id:'theatre-maintenance',minX:-5.9,maxX:-4,minZ:10.7,maxZ:17.2 },
  { id:'theatre-booth',minX:-2,maxX:2,minZ:18.7,maxZ:24.5 },
];
export const THEATRE_ACTOR_SPAWN: Vec3 = { x:2.8,y:0,z:6.55 };
export const THEATRE_CROSSING: readonly Vec3[] = [THEATRE_ACTOR_SPAWN,{ x:.8,y:0,z:6.55 },{ x:-2.6,y:0,z:6.55 }];
export const THEATRE_PATROL: readonly Vec3[] = [
  { x:-2.6,y:0,z:6.55 },{ x:-2.6,y:0,z:10.5 },{ x:-2.6,y:0,z:14.1 },{ x:-2.6,y:0,z:16.25 },
  { x:0,y:0,z:16.25 },{ x:2.55,y:0,z:16.25 },{ x:2.55,y:0,z:12.9 },{ x:2.55,y:0,z:9.5 },{ x:2.8,y:0,z:6.55 },
];
export const THEATRE_METAL_FLOORS: readonly FloorRegion[] = [
  { id:'theatre-west-metal',minX:-3.7,maxX:-1.5,minZ:10.7,maxZ:11.7 },
  { id:'theatre-east-metal',minX:1.5,maxX:3.7,minZ:14,maxZ:15 },
];
export function theatreTarget(id: InteractableDefinition['id'],label:string,fixture:PanelSurface): InteractableDefinition {
  return { id,label,center:fixture.center,radius:Math.max(fixture.width,fixture.height)/2,maxDistance:fixture.maxDistance,rectangle:{ width:fixture.width,height:fixture.height,normal:fixture.normal,right:fixture.right } };
}
export const THEATRE_RAIL_LENGTH = LIGHT_SPEC.railHalfLength * 2;
