import { isSafePose } from '../firstPerson/geometry';
import { createInitialRuntime } from '../firstPerson/runtime';
import { createCheckpoint } from '../firstPerson/checkpoint';
import { getWorld } from '../firstPerson/chapter';
import { THEATRE_BELLS, THEATRE_SHUTTER } from '../theatre/environment';
import { validateActionInstance } from './actionInstance';
import { STAGE_DEFINITIONS } from './definitions';
import { stageModule, validateStageModules } from './modules';

const finite = (...values: number[]) => values.every(Number.isFinite);
const vec = (value: { x: number; y: number; z: number }) => finite(value.x, value.y, value.z);

/** The same definitions, constructors, world and codecs used by play. */
export function validateStageDefinitions(): string[] {
  const errors=validateStageModules();
  const unique=(label:string,values:readonly string[])=>{if(new Set(values).size!==values.length)errors.push(`duplicate ${label}`);};
  unique('stageId',STAGE_DEFINITIONS.map(stage=>stage.id));
  unique('save key',STAGE_DEFINITIONS.map(stage=>stage.saveKey));
  const instanceIds=[...THEATRE_BELLS,THEATRE_SHUTTER].map(instance=>instance.instanceId);
  unique('instanceId',instanceIds);
  for(const instance of [...THEATRE_BELLS,THEATRE_SHUTTER])errors.push(...validateActionInstance(instance).map(error=>`${instance.instanceId}: ${error}`));
  for(const stage of STAGE_DEFINITIONS){
    unique(`${stage.id} discovery`,stage.discoveries);
    unique(`${stage.id} target catalog`,stage.targets);
    if(!Number.isSafeInteger(stage.contentVersion)||stage.contentVersion<1)errors.push(`${stage.id}: invalid contentVersion`);
    if(!stage.title.trim()||!stage.teaser.trim())errors.push(`${stage.id}: missing title or teaser`);
    const runtime=createInitialRuntime(undefined,undefined,stage.id),world=getWorld(runtime),module=stageModule(stage.id);
    if(runtime.chapterId!==stage.id||world.chapterId&&world.chapterId!==stage.id)errors.push(`${stage.id}: wrong runtime or world`);
    if(!isSafePose(runtime.pose,world))errors.push(`${stage.id}: unsafe spawn`);
    unique(`${stage.id} floor`,world.floors.map(floor=>floor.id));
    unique(`${stage.id} solid`,world.solids.map(solid=>solid.id));
    unique(`${stage.id} target`,world.interactables.map(target=>target.id));
    for(const target of world.interactables)if(!stage.targets.some(id=>id===target.id))errors.push(`${stage.id}: unregistered target ${target.id}`);
    for(const floor of world.floors)if(!finite(floor.minX,floor.maxX,floor.minZ,floor.maxZ)||floor.minX>=floor.maxX||floor.minZ>=floor.maxZ)errors.push(`${stage.id}: invalid floor ${floor.id}`);
    for(const solid of world.solids)if(!vec(solid.min)||!vec(solid.max)||solid.min.x>=solid.max.x||solid.min.y>=solid.max.y||solid.min.z>=solid.max.z)errors.push(`${stage.id}: invalid solid ${solid.id}`);
    for(const target of world.interactables){
      if(!vec(target.center)||!finite(target.radius,target.maxDistance)||target.radius<0||target.maxDistance<=0)errors.push(`${stage.id}: invalid target ${target.id}`);
      const r=target.rectangle;
      if(r){const n=Math.hypot(r.normal.x,r.normal.y,r.normal.z),side=Math.hypot(r.right.x,r.right.y,r.right.z),dot=r.normal.x*r.right.x+r.normal.y*r.right.y+r.normal.z*r.right.z;
        if(!finite(r.width,r.height,n,side,dot)||r.width<=0||r.height<=0||Math.abs(n-1)>1e-4||Math.abs(side-1)>1e-4||Math.abs(dot)>1e-4)errors.push(`${stage.id}: invalid panel ${target.id}`);}
    }
    const checkpoint=createCheckpoint(runtime),restored=module?module.restore(checkpoint):undefined;
    if(checkpoint.chapterId!==stage.id||module&&!restored)errors.push(`${stage.id}: codec roundtrip failed`);
  }
  const theatre=createInitialRuntime(undefined,undefined,'shadow-theatre-v1'),world=getWorld(theatre);
  for(const bell of THEATRE_BELLS){
    if(!world.solids.some(solid=>solid.id===`${bell.instanceId}-receiver`))errors.push(`${bell.instanceId}: receiver absent from world`);
    if(!finite(bell.receiver.x,bell.receiver.y,bell.receiver.z)||!world.floors.some(f=>bell.receiver.x>=f.minX&&bell.receiver.x<=f.maxX&&bell.receiver.z>=f.minZ&&bell.receiver.z<=f.maxZ))errors.push(`${bell.instanceId}: unreachable receiver`);
  }
  if(!world.solids.some(solid=>solid.id===THEATRE_SHUTTER.instanceId))errors.push('manual shutter collider absent');
  return errors;
}
