import * as THREE from 'three';
import { createCheckpoint, restoreCheckpoint } from '../../../domain/firstPerson/checkpoint';
import { stageWorld } from '../../../domain/stages/stage-kit-probe/definition';
import { STAGE_SCENE_BINDINGS } from '../stageSceneBindings';
import { advanceController, controllerSnapshot, createController, interactController, syncCamera, worldForController } from '../runtimeController';

test('registered dev probe uses the shared controller from entry through save and cold resume',()=>{
  const controller=createController(undefined,false,true,'stage-kit-probe'),camera=new THREE.PerspectiveCamera(65,390/844,.08,60);
  Object.assign(controller.diagnostics,{stage:'ready',rendererOwnership:'live',appActive:true,sceneMode:'chapter',paused:false,open:false});
  expect(STAGE_SCENE_BINDINGS['stage-kit-probe']).toBeDefined();
  expect(worldForController(controller).chapterId).toBe('stage-kit-probe');
  for(let i=0;i<8;i++){controller.input.forward=1;advanceController(controller,1/60,camera);}
  controller.input.forward=0;syncCamera(controller,camera);
  const before=controllerSnapshot(controller).key;
  expect(interactController(controller,'stage-kit-probe-device')).toBe(true);
  expect(controllerSnapshot(controller).key).not.toBe(before);
  expect(createCheckpoint(controller.runtime).stageData).toMatchObject({activated:true});
  expect(worldForController(controller).solids.find(s=>s.id==='door')!.min.y).toBeGreaterThan(3);
  for(let i=0;i<205;i++){controller.input.forward=1;advanceController(controller,1/60,camera);}
  controller.input.forward=0;syncCamera(controller,camera);
  expect(controller.runtime.pose.position.z).toBeGreaterThan(5.1);
  expect(interactController(controller,'stage-kit-probe-exit')).toBe(true);
  expect(controller.runtime.progress.cleared).toBe(true);
  const checkpoint=createCheckpoint(controller.runtime),restored=restoreCheckpoint(checkpoint);
  expect(restored?.checkpoint.chapterId).toBe('stage-kit-probe');
  const cold=createController(restored!.checkpoint,false,true,'stage-kit-probe');
  expect(cold.runtime.progress.cleared).toBe(true);
  expect(cold.runtime.pose.position.z).toBe(5.3);
  expect(stageWorld(true).solids.find(s=>s.id==='door')!.min.y).toBeGreaterThan(3);
});
