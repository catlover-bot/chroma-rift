import * as THREE from 'three';
import { createActorMotion } from '../../../domain/actorMotion';
import { segmentOccluded, updatePlayer } from '../../../domain/firstPerson/geometry';
import type { Vec3 } from '../../../domain/firstPerson/types';
import { THEATRE_BELLS, THEATRE_SHUTTER } from '../../../domain/theatre/environment';
import { theatreActorEdgeOpen } from '../../../domain/theatre/actor';
import { theatreCheckpoint } from '../../../storage/testFixtures/theatre';
import { advanceController, commandController, createController, interactController, syncCamera, worldForController } from '../runtimeController';
import { theatreEnvironmentAcquisition } from '../theatreController';

function setup(position: Vec3, target: Vec3, actorPosition: Vec3) {
  const controller=createController(theatreCheckpoint('light'),false,true),camera=new THREE.PerspectiveCamera(65,390/844,.08,60);
  controller.runtime={...controller.runtime,pose:{position:{...position},yaw:0,pitch:0},progress:{...controller.runtime.progress,theatre:{...controller.runtime.progress.theatre!,story:{...controller.runtime.progress.theatre!.story,crossingStarted:true}}},
    theatre:{...controller.runtime.theatre!,actor:{...controller.runtime.theatre!.actor,phase:'patrol',motion:createActorMotion(actorPosition,0),startupGrace:0,contactCooldown:0}}};
  const dx=target.x-position.x,dz=target.z-position.z;
  controller.runtime.pose.yaw=Math.atan2(-dx,-dz);
  controller.runtime.pose.pitch=Math.atan2(target.y-position.y,Math.hypot(dx,dz));
  syncCamera(controller,camera);
  Object.assign(controller.diagnostics,{stage:'ready',rendererOwnership:'live',appActive:true,sceneMode:'chapter',paused:false,open:false});
  return {controller,camera};
}

test.each(THEATRE_BELLS)('bell $instanceId uses its own panel and receiver through the controller',bell=>{
  const position={x:bell.fixture.center.x-bell.fixture.normal.x*.65,y:1.6,z:bell.fixture.center.z-bell.fixture.normal.z*.65};
  // Stand on the outward normal side of the physical plate.
  position.x=bell.fixture.center.x+bell.fixture.normal.x*.65;
  position.z=bell.fixture.center.z+bell.fixture.normal.z*.65;
  const {controller,camera}=setup(position,bell.fixture.center,{x:bell.receiver.x,y:0,z:bell.receiver.z-.7});
  expect(theatreEnvironmentAcquisition(controller,bell.instanceId).kind).toBe('ready');
  expect(interactController(controller,bell.instanceId)).toBe(true);
  const live=controller.runtime.theatre!;
  expect(live.environmentNoise?.position).toEqual(bell.receiver);
  expect(live.environment.bells[bell.instanceId].activations).toBe(1);
  expect(live.environment.bells[THEATRE_BELLS.find(other=>other.instanceId!==bell.instanceId)!.instanceId].activations).toBe(0);
  expect(interactController(controller,bell.instanceId)).toBe(false);
  advanceController(controller,1/60,camera);
  expect(controller.runtime.theatre!.actor.lastHeard).toEqual(bell.receiver);
  expect(controller.runtime.theatre!.actor.phase).toBe('investigate');
});

test('manual shutter shares one physical progress for drawing, sight and collision and reopens from the far side',()=>{
  const handle=THEATRE_SHUTTER.handles[0]!;
  const {controller,camera}=setup({x:handle.center.x,y:1.6,z:handle.center.z-.7},handle.center,{x:-2.6,y:0,z:14.1});
  const sightFrom={x:-2.6,y:1.6,z:10.6},sightTo={x:-2.6,y:1.6,z:13};
  expect(segmentOccluded(sightFrom,sightTo,worldForController(controller))).toBe(false);
  expect(theatreActorEdgeOpen({x:-2.6,y:0,z:10.5},{x:-2.6,y:0,z:13.8},worldForController(controller))).toBe(true);
  expect(theatreEnvironmentAcquisition(controller,'theatre-shutter-south').kind).toBe('ready');
  expect(interactController(controller,'theatre-shutter-south')).toBe(true);
  for(let i=0;i<60;i++)advanceController(controller,1/60,camera);
  expect(controller.runtime.theatre!.environment.shutter.progress).toBe(1);
  const world=worldForController(controller),solid=world.solids.find(item=>item.id==='theatre-manual-shutter')!;
  expect(solid.min.y).toBe(0);
  expect(segmentOccluded(sightFrom,sightTo,world)).toBe(true);
  expect(theatreActorEdgeOpen({x:-2.6,y:0,z:10.5},{x:-2.6,y:0,z:13.8},world)).toBe(false);
  expect(theatreActorEdgeOpen({x:2.55,y:0,z:10.5},{x:2.55,y:0,z:13.8},world)).toBe(true);
  const walking=updatePlayer({position:sightFrom,yaw:Math.PI,pitch:0},{strafe:0,forward:1},1,world);
  expect(walking.position.z).toBeLessThan(THEATRE_SHUTTER.z);
  controller.runtime={...controller.runtime,pose:{position:{x:handle.center.x,y:1.6,z:THEATRE_SHUTTER.z+.7},yaw:0,pitch:0}};
  const north=THEATRE_SHUTTER.handles[1]!,p=controller.runtime.pose.position,dx=north.center.x-p.x,dz=north.center.z-p.z;
  controller.runtime.pose.yaw=Math.atan2(-dx,-dz);controller.runtime.pose.pitch=Math.atan2(north.center.y-p.y,Math.hypot(dx,dz));syncCamera(controller,camera);
  expect(interactController(controller,'theatre-shutter-north')).toBe(true);
  for(let i=0;i<60;i++)advanceController(controller,1/60,camera);
  expect(controller.runtime.theatre!.environment.shutter.progress).toBe(0);
  expect(segmentOccluded(sightFrom,sightTo,worldForController(controller))).toBe(false);
});

test('pause discards an unpresented bell event but preserves that instance cooldown',()=>{
  const bell=THEATRE_BELLS[0]!,position={x:bell.fixture.center.x+bell.fixture.normal.x*.65,y:1.6,z:bell.fixture.center.z};
  const {controller,camera}=setup(position,bell.fixture.center,{x:2.8,y:0,z:9.5});
  expect(interactController(controller,bell.instanceId)).toBe(true);
  const cooldown=controller.runtime.theatre!.environment.bells[bell.instanceId].cooldown;
  commandController(controller,{type:'pause'});
  expect(controller.runtime.theatre!.environmentNoise).toBeUndefined();
  expect(controller.runtime.theatre!.environment.bells[bell.instanceId].cooldown).toBe(cooldown);
  commandController(controller,{type:'resume'});syncCamera(controller,camera);
  expect(interactController(controller,bell.instanceId)).toBe(false);
  advanceController(controller,1/60,camera);
  expect(controller.runtime.theatre!.environment.bells[bell.instanceId].cooldown).toBeLessThan(cooldown);
});
