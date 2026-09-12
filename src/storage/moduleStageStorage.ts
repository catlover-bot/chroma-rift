import AsyncStorage from '@react-native-async-storage/async-storage';
import { STAGE_DEFINITIONS, stageDefinition } from '../domain/stageKit/definitions';
import { stageModule } from '../domain/stageKit/modules';
import type { CheckpointState } from '../domain/firstPerson/types';

type Boundary = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>;
  current: (lease: number) => boolean;
  epoch: () => number;
  preserve: (checkpoint: CheckpointState, lease: number) => Promise<boolean>;
};
export type ModuleStageLoad = { checkpoint: CheckpointState; hasCheckpoint: boolean;
  status: 'empty' | 'loaded' | 'recovered' | 'blocked'; checkpointWritable: boolean; message?: string };
type Cache = { latest: CheckpointState | undefined; writable: boolean };

/** The existing serial writer and run lease are injected by the app storage
 * owner. A stage codec alone can decode its data; unknown raw data is held. */
export function createModuleStageStorage(boundary: Boundary) {
  const cache = new Map<string, Cache>();
  const simple = (id: unknown) => {
    const definition=stageDefinition(id),module=stageModule(id);
    return definition?.renderKind==='simple'&&module?.renderKind==='simple'&&module.id===definition.id ? {definition,module} : undefined;
  };
  const fresh = (id: string): CheckpointState => {
    const binding=simple(id);
    if(!binding)throw new RangeError(`Unknown module stage: ${id}`);
    return binding.module.checkpoint(binding.module.create());
  };
  async function read(id: string, lease: number): Promise<ModuleStageLoad> {
    const binding=simple(id);
    if(!binding)throw new RangeError(`Unknown module stage: ${id}`);
    const state=cache.get(id)??{latest:undefined,writable:true};
    try {
      const raw=await AsyncStorage.getItem(binding.definition.saveKey);
      if(!boundary.current(lease))return {checkpoint:fresh(id),hasCheckpoint:false,status:'blocked',checkpointWritable:false};
      if(raw===null){state.latest=undefined;state.writable=true;cache.set(id,state);return {checkpoint:fresh(id),hasCheckpoint:false,status:'empty',checkpointWritable:true};}
      const restored=binding.module.restore(JSON.parse(raw));
      if(!restored)throw new Error('unsupported stage checkpoint');
      state.latest=restored.checkpoint;state.writable=true;cache.set(id,state);
      return {checkpoint:restored.checkpoint,hasCheckpoint:true,status:restored.recovered?'recovered':'loaded',checkpointWritable:true};
    } catch {
      state.latest=undefined;state.writable=false;cache.set(id,state);
      return {checkpoint:fresh(id),hasCheckpoint:true,status:'blocked',checkpointWritable:false,
        message:'このステージの保存を読み込めませんでした。元のデータを保持し、この章の自動保存を停止しています。'};
    }
  }
  return {
    fresh,
    keys(): string[] {return STAGE_DEFINITIONS.filter(stage=>stage.renderKind==='simple').flatMap(stage=>[stage.saveKey,`${stage.saveKey}.backup`]);},
    load(id: string): Promise<ModuleStageLoad> {const lease=boundary.epoch();return boundary.enqueue(()=>read(id,lease));},
    save(checkpoint: CheckpointState, lease: number): Promise<boolean> {
      const raw=JSON.stringify(checkpoint);
      return boundary.enqueue(async()=>{
        const binding=simple(checkpoint.chapterId);
        if(!binding||!boundary.current(lease))return false;
        const restored=binding.module.restore(JSON.parse(raw));
        if(!restored||restored.recovered)return false;
        let state=cache.get(checkpoint.chapterId);
        if(!state){await read(checkpoint.chapterId,lease);state=cache.get(checkpoint.chapterId);}
        if(!state?.writable||!boundary.current(lease))return false;
        if(state.latest&&(!binding.module.canReplaceCheckpoint||!binding.module.canReplaceCheckpoint(state.latest,restored.checkpoint)))return false;
        try {
          await AsyncStorage.setItem(binding.definition.saveKey,JSON.stringify(restored.checkpoint));
          if(!boundary.current(lease)){state.latest=undefined;return false;}
          state.latest=restored.checkpoint;return true;
        }catch{return false;}
      });
    },
    reset(id: string, checkpoint: CheckpointState, lease: number): Promise<boolean> {
      const binding=simple(id),restored=binding?.module.restore(checkpoint);
      if(!binding||!restored||restored.recovered)return Promise.resolve(false);
        const state=cache.get(id)??{latest:undefined,writable:true};state.writable=false;cache.set(id,state);
      return boundary.enqueue(async()=>{
        if(!boundary.current(lease))return false;
        try {
          const raw=await AsyncStorage.getItem(binding.definition.saveKey);
          if(!boundary.current(lease))return false;
          if(raw!==null){
            let previous:ReturnType<typeof binding.module.restore>;
            try{previous=binding.module.restore(JSON.parse(raw));}catch{previous=undefined;}
            if(previous&&!previous.recovered&&(!await boundary.preserve(previous.checkpoint,lease)||!boundary.current(lease)))return false;
          }
          if(raw!==null)await AsyncStorage.setItem(`${binding.definition.saveKey}.backup`,raw);
          if(!boundary.current(lease))return false;
          await AsyncStorage.setItem(binding.definition.saveKey,JSON.stringify(restored.checkpoint));
          if(!boundary.current(lease))return false;
          state.latest=restored.checkpoint;state.writable=true;return true;
        }catch{return false;}
      });
    },
    resetCache(success: boolean): void {cache.clear();if(!success)for(const stage of STAGE_DEFINITIONS.filter(item=>item.renderKind==='simple'))cache.set(stage.id,{latest:undefined,writable:false});},
  };
}
