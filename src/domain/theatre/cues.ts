import type { Vec3 } from '../firstPerson/types';
import { THEATRE_PROJECTOR } from './definition';
import { THEATRE_BELLS, THEATRE_SHUTTER, type TheatreBellId } from './environment';

export type TheatreCue = Readonly<{
  id: string; chapterId: 'shadow-theatre-v1'; kind: 'deviceActivated' | 'firstSafeEncounter' | 'routeStateChanged';
  trigger: 'acceptedCommand' | 'presentedEncounter'; priority: number; scope: 'local';
  source: Vec3; audio: 'interaction' | 'door'; subtitle?: string;
}>;
const base = { chapterId: 'shadow-theatre-v1', trigger: 'acceptedCommand', priority: 1, scope: 'local' } as const;
export function bellCue(id: TheatreBellId): TheatreCue {
  const bell=THEATRE_BELLS.find(item=>item.instanceId===id)!;
  return { ...base,id:`${id}-activated`,kind:'deviceActivated',source:bell.receiver,audio:'interaction',subtitle:`呼び鈴${bell.number}の受鈴器が鳴った。` };
}
export function shutterCue(closed:boolean): TheatreCue {
  return { ...base,id:`${THEATRE_SHUTTER.instanceId}-${closed?'closed':'opened'}`,kind:'routeStateChanged',
    source:{x:(THEATRE_SHUTTER.minX+THEATRE_SHUTTER.maxX)/2,y:1.4,z:THEATRE_SHUTTER.z},audio:'door' };
}
export function projectorCue(): TheatreCue {
  return { ...base,id:'theatre-projector-activated',kind:'deviceActivated',source:THEATRE_PROJECTOR.position,audio:'interaction' };
}
