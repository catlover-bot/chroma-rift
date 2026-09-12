import AsyncStorage from '@react-native-async-storage/async-storage';
import { createModuleStageStorage } from '../moduleStageStorage';
import { stageModule } from '../../domain/stageKit/modules';
import { STAGE_DEFINITIONS } from '../../domain/stageKit/definitions';
import type { CheckpointState } from '../../domain/firstPerson/types';
import { createStageSession } from '../../domain/stages/stage-kit-probe/session';

const id='stage-kit-probe',key=STAGE_DEFINITIONS.find(stage=>stage.id===id)!.saveKey;
let lease=1;
const makeStore=()=>createModuleStageStorage({enqueue:async work=>work(),current:value=>value===lease,epoch:()=>lease,preserve:async()=>true});
const fresh=():CheckpointState=>{const module=stageModule(id)!;return module.checkpoint(module.create());};
beforeEach(async()=>{lease++;await AsyncStorage.clear();});

test('generated stage writes and cold-loads through its own key without touching an existing chapter',async()=>{
  const store=makeStore(),initial=await store.load(id);
  expect(initial).toMatchObject({status:'empty',hasCheckpoint:false,checkpointWritable:true});
  const module=stageModule(id)!,runtime=module.create(initial.checkpoint);
  const active={...runtime,stageSession:{stageId:id,value:{...createStageSession(String(runtime.session)),activated:true}}};
  const checkpoint=module.checkpoint(active);
  expect(await store.save(checkpoint,lease)).toBe(true);
  expect(await AsyncStorage.getItem(key)).not.toBeNull();
  expect((await makeStore().load(id)).checkpoint.stageData).toEqual(checkpoint.stageData);
  expect(await AsyncStorage.getItem('chroma-rift.shadow-theatre.v1')).toBeNull();
  expect(await store.save(initial.checkpoint,lease)).toBe(false);
});

test('unknown checkpoint and old lease preserve raw data; explicit reset backs it up',async()=>{
  const raw=JSON.stringify({...fresh(),levelVersion:99});
  await AsyncStorage.setItem(key,raw);
  const store=makeStore(),loaded=await store.load(id);
  expect(loaded).toMatchObject({status:'blocked',checkpointWritable:false,hasCheckpoint:true});
  expect(await store.save(fresh(),lease)).toBe(false);
  expect(await AsyncStorage.getItem(key)).toBe(raw);
  const old=lease;lease++;
  expect(await store.save(fresh(),old)).toBe(false);
  expect(await store.reset(id,fresh(),lease)).toBe(true);
  expect(await AsyncStorage.getItem(`${key}.backup`)).toBe(raw);
  expect((await makeStore().load(id)).status).toBe('loaded');
  expect(await store.save({...fresh(),chapterId:'shadow-theatre-v1'},lease)).toBe(false);
});
