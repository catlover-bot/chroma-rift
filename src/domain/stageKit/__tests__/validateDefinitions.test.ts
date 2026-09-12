import { validateStageDefinitions } from '../validateDefinitions';
import { STAGE_DEFINITIONS } from '../definitions';
import { stageModule, stageInputPolicy } from '../modules';
import { createInitialRuntime } from '../../firstPerson/runtime';
import { createCheckpoint } from '../../firstPerson/checkpoint';

test('all live stage definitions and codecs pass the authoring validator',()=>{
  expect(validateStageDefinitions()).toEqual([]);
});
test('registered modules independently start and restore without sharing a checkpoint reference',()=>{
  for(const definition of STAGE_DEFINITIONS){
    const module=stageModule(definition.id),fresh=createInitialRuntime(undefined,undefined,definition.id),checkpoint=createCheckpoint(fresh);
    const first=createInitialRuntime(checkpoint,100),second=createInitialRuntime(checkpoint,101);
    expect(first.chapterId).toBe(definition.id);
    expect(first.pose).not.toBe(second.pose);
    expect(first.pose.position).not.toBe(second.pose.position);
    expect(first.progress).not.toBe(second.progress);
    if(module){expect(module.renderKind).toBe(definition.renderKind);expect(module.restore(checkpoint)?.checkpoint.chapterId).toBe(definition.id);}
    expect(stageInputPolicy(first).move).toBe(true);
  }
  expect(stageModule('future-stage')).toBeUndefined();
  expect(()=>createInitialRuntime(undefined,undefined,'future-stage')).toThrow(/Unknown stage/);
});
