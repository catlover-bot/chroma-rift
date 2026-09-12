#!/usr/bin/env node
'use strict';
/* global __dirname */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function help(){process.stdout.write('Usage: node scripts/create-stage.cjs --id <safe-slug> --title <title> [--dry-run]\nCreates a development-only stage folder. Register it explicitly after completing the authoring checklist.\n');}
if(process.argv.includes('--help')){help();process.exit(0);}
const args=process.argv.slice(2),values={};let dryRun=false;
for(let i=0;i<args.length;i++){
  const key=args[i];
  if(key==='--dry-run'){if(dryRun)throw new Error('Duplicate --dry-run');dryRun=true;continue;}
  if(key!=='--id'&&key!=='--title')throw new Error(`Unknown option: ${key}`);
  if(values[key]!==undefined||i+1>=args.length||args[i+1].startsWith('--'))throw new Error(`Missing or duplicate ${key}`);
  values[key]=args[++i];
}
const slug=values['--id'],title=values['--title'];
if(typeof slug!=='string'||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug)||slug.length>48)throw new Error('ID must be a lowercase safe slug of at most 48 characters');
if(typeof title!=='string'||!title.trim()||title.length>80||/[\x00-\x1f\x7f]/.test(title))throw new Error('Title must be 1–80 printable characters');
const stageDir=path.join(root,'src','domain','stages',slug);
if(fs.existsSync(stageDir))throw new Error(`Stage already exists: ${stageDir}`);
const stageId=JSON.stringify(slug),stageTitle=JSON.stringify(title);
const files={
  'definition.ts':`import type { PlayerPose, WorldGeometry } from '../../firstPerson/types';
export const STAGE_ID=${stageId} as const;
export const STAGE_TITLE=${stageTitle};
export type TargetId='${slug}-device'|'${slug}-door'|'${slug}-exit';
export const SPAWN:PlayerPose={position:{x:0,y:1.6,z:-2.5},yaw:Math.PI,pitch:0};
export const POST_DOOR:PlayerPose={position:{x:0,y:1.6,z:4},yaw:Math.PI,pitch:0};
export const EXIT:PlayerPose={position:{x:0,y:1.6,z:5.3},yaw:Math.PI,pitch:0};
export function stageWorld(activated:boolean):WorldGeometry<TargetId>{
  return {chapterId:STAGE_ID,variant:'entrance',floors:[{id:'room',minX:-2,maxX:2,minZ:-3,maxZ:6}],
    solids:[{id:'west',min:{x:-2.12,y:0,z:-3},max:{x:-2,y:3.5,z:6},kind:'wall',opaque:true},
      {id:'east',min:{x:2,y:0,z:-3},max:{x:2.12,y:3.5,z:6},kind:'wall',opaque:true},
      {id:'door',min:{x:-.7,y:activated?3.6:0,z:3.15},max:{x:.7,y:activated?7.1:3.5,z:3.3},kind:'door',opaque:true}],
    interactables:[{id:'${slug}-device',label:'装置を押す',center:{x:0,y:1.4,z:0},radius:.3,maxDistance:2.5},
      {id:'${slug}-door',label:'開いた扉',center:{x:0,y:1.4,z:3.15},radius:.3,maxDistance:2.5},
      {id:'${slug}-exit',label:'出口へ進む',center:{x:0,y:1.4,z:5.8},radius:.3,maxDistance:2.5}],
    colorPanels:[],keyFragments:[],keyFrame:{center:{x:0,y:0,z:0},width:0,height:0,outline:[]}};
}
`,
  'session.ts':`import { updatePlayer } from '../../firstPerson/geometry';
import type { MovementInput, PlayerPose } from '../../firstPerson/types';
import { EXIT, SPAWN, STAGE_ID, stageWorld, type TargetId } from './definition';
import { parseStageCheckpoint, type StageCheckpoint } from './checkpoint';
export type StageSession={stageId:typeof STAGE_ID;sessionId:string;lastSeq:number;pose:PlayerPose;activated:boolean;cleared:boolean};
export type StageCommand={sessionId:string;seq:number;targetId:TargetId;type:'activate'|'exit'};
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
export function isStageSession(value:unknown):value is StageSession{
  if(!record(value)||value.stageId!==STAGE_ID||typeof value.sessionId!=='string'||!Number.isSafeInteger(value.lastSeq)||Number(value.lastSeq)<0||
    typeof value.activated!=='boolean'||typeof value.cleared!=='boolean'||value.cleared&&!value.activated||!record(value.pose)||!record(value.pose.position))return false;
  const pose=value.pose,position=pose.position as Record<string,unknown>;
  return [position.x,position.y,position.z,pose.yaw,pose.pitch].every(n=>typeof n==='number'&&Number.isFinite(n));
}
export function createStageSession(sessionId:string,raw?:unknown):StageSession{
  const checkpoint=raw===undefined?undefined:parseStageCheckpoint(raw);
  if(raw!==undefined&&!checkpoint)throw new RangeError('Unsupported stage checkpoint');
  const pose=checkpoint?.pose??SPAWN;
  return {stageId:STAGE_ID,sessionId,lastSeq:0,pose:{...pose,position:{...pose.position}},activated:checkpoint?.activated??false,cleared:checkpoint?.cleared??false};
}
export function stepStage(session:StageSession,input:MovementInput,dt:number):StageSession{
  if(session.cleared||!Number.isFinite(dt)||dt<=0)return session;
  const pose=updatePlayer(session.pose,input,dt,stageWorld(session.activated));
  return {...session,pose};
}
export function commandStage(session:StageSession,command:StageCommand):{session:StageSession;accepted:boolean;reason:'ready'|'stale'|'tooFar'|'prerequisiteMissing'}{
  if(command.sessionId!==session.sessionId||!Number.isSafeInteger(command.seq)||command.seq<=session.lastSeq)return {session,accepted:false,reason:'stale'};
  const consumed={...session,lastSeq:command.seq};
  if(command.type==='activate'&&command.targetId==='${slug}-device'&&!session.activated){
    if(Math.hypot(session.pose.position.x,session.pose.position.z)>2.5)return {session:consumed,accepted:false,reason:'tooFar'};
    return {session:{...consumed,activated:true},accepted:true,reason:'ready'};
  }
  if(command.type==='exit'&&command.targetId==='${slug}-exit'&&session.activated&&session.pose.position.z>=5.1)
    return {session:{...consumed,cleared:true},accepted:true,reason:'ready'};
  return {session:consumed,accepted:false,reason:'prerequisiteMissing'};
}
export function checkpointStage(session:StageSession):StageCheckpoint{
  return {schemaVersion:1,stageId:STAGE_ID,activated:session.activated,cleared:session.cleared,
    pose:session.cleared?{position:{...EXIT.position},yaw:EXIT.yaw,pitch:EXIT.pitch}:session.activated&&session.pose.position.z>=3.6?{position:{x:0,y:1.6,z:4},yaw:Math.PI,pitch:0}:{position:{...SPAWN.position},yaw:SPAWN.yaw,pitch:SPAWN.pitch}};
}
`,
  'checkpoint.ts':`import type { PlayerPose } from '../../firstPerson/types';
import { EXIT, POST_DOOR, SPAWN, STAGE_ID } from './definition';
export type StageCheckpoint={schemaVersion:1;stageId:typeof STAGE_ID;activated:boolean;cleared:boolean;pose:PlayerPose};
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
export function parseStageCheckpoint(value:unknown):StageCheckpoint|undefined{
  if(!record(value)||value.schemaVersion!==1||value.stageId!==STAGE_ID||typeof value.activated!=='boolean'||typeof value.cleared!=='boolean'||!record(value.pose)||!record(value.pose.position))return;
  const p=value.pose,position=p.position as Record<string,unknown>;
  if(value.cleared&&!value.activated||![position.x,position.y,position.z,p.yaw,p.pitch].every(n=>typeof n==='number'&&Number.isFinite(n)))return;
  const safe=[SPAWN,POST_DOOR,EXIT].find(point=>point.position.x===position.x&&point.position.y===position.y&&point.position.z===position.z&&point.yaw===p.yaw&&point.pitch===p.pitch);
  if(!safe||safe===POST_DOOR&&!value.activated||safe===EXIT&&!value.cleared)return;
  return {schemaVersion:1,stageId:STAGE_ID,activated:value.activated,cleared:value.cleared,pose:{...safe,position:{...safe.position}}};
}
`,
  'binding.ts':fs.readFileSync(path.join(__dirname,'templates','simple-stage-binding.ts.txt'),'utf8'),
  'scene.tsx':`/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import type { WorldGeometry } from '../../firstPerson/types';
import type { SceneResources } from '../../../rendering/firstPerson/resources';
/** Dev-only scene. The host owns its Canvas, renderer and shared resources. */
export function StageScene({world,resources}:{world:WorldGeometry<string>;resources:SceneResources}){
  return <group name=${stageId} dispose={null}><ambientLight intensity={1.4}/>
    {world.floors.map(f=><mesh key={f.id} geometry={resources.box} material={resources.floor} position={[(f.minX+f.maxX)/2,-.1,(f.minZ+f.maxZ)/2]} scale={[f.maxX-f.minX,.2,f.maxZ-f.minZ]}/>)}
    {world.solids.map(s=><mesh key={s.id} geometry={resources.box} material={s.kind==='door'?resources.door:resources.wall} position={[(s.min.x+s.max.x)/2,(s.min.y+s.max.y)/2,(s.min.z+s.max.z)/2]} scale={[s.max.x-s.min.x,s.max.y-s.min.y,s.max.z-s.min.z]}/>)}
    {world.interactables.map(t=><mesh key={t.id} geometry={resources.box} material={resources.device} position={[t.center.x,t.center.y,t.center.z]} scale={[.2,.2,.1]}/>)}
  </group>;
}
`,
  'stage.test.ts':`import { createStageSession, commandStage, stepStage, checkpointStage } from './session';
import { parseStageCheckpoint } from './checkpoint';
import { STAGE_ID, stageWorld } from './definition';
test('dev probe: entry, device, physical door, exit, checkpoint and independent resume',()=>{
  let session=createStageSession('first');
  expect(session.stageId).toBe(STAGE_ID);
  for(let i=0;i<45;i++)session=stepStage(session,{strafe:0,forward:1},1/60);
  const activation=commandStage(session,{sessionId:'first',seq:1,targetId:'${slug}-device',type:'activate'});
  expect(activation.accepted).toBe(true);session=activation.session;
  expect(stageWorld(session.activated).solids.find(s=>s.id==='door')!.min.y).toBeGreaterThan(3);
  for(let i=0;i<260;i++)session=stepStage(session,{strafe:0,forward:1},1/60);
  expect(session.pose.position.z).toBeGreaterThan(5);
  expect(session.cleared).toBe(false);
  const exiting=commandStage(session,{sessionId:'first',seq:2,targetId:'${slug}-exit',type:'exit'});
  expect(exiting.accepted).toBe(true);session=exiting.session;
  const checkpoint=checkpointStage(session),restored=parseStageCheckpoint(checkpoint)!;
  expect(restored).toBeDefined();
  const one=createStageSession('one',restored),two=createStageSession('two',restored);
  one.pose.position.z=4.5;
  expect(two.pose.position.z).toBe(5.3);
  expect(checkpoint.pose.position.z).toBe(5.3);
  expect(parseStageCheckpoint({...checkpoint,schemaVersion:99})).toBeUndefined();
});
`,
  'README.md':`# ${title}\n\nThis is a development-only stage draft. It is not in the player's stage catalog.\n\nRun its local test with \`npx jest --runInBand --runTestsByPath src/domain/stages/${slug}/stage.test.ts\`.\n\nTo promote it, finish its puzzle, world, checkpoint and scene; add one entry to \`src/domain/stageKit/definitions.ts\` (including target IDs and save key), one typed binding to \`src/domain/stageKit/modules.ts\`, and a render binding for the scene. Then run the validator and full checks. A draft is never silently exposed to players.\n`
};
const relative=Object.keys(files).map(name=>path.relative(root,path.join(stageDir,name)));
process.stdout.write(`${dryRun?'Dry run':'Creating'} ${slug}:\n${relative.map(name=>'  '+name).join('\n')}\nRegistration: src/domain/stageKit/definitions.ts, src/domain/stageKit/modules.ts, and src/rendering/firstPerson/stageSceneBindings.tsx (manual, after completion).\n`);
if(dryRun)process.exit(0);
fs.mkdirSync(stageDir,{recursive:true});
for(const [name,content] of Object.entries(files))fs.writeFileSync(path.join(stageDir,name),content,{flag:'wx'});
