import { createBaseRuntime } from '../firstPerson/baseRuntime';
import type { ChapterRuntime, CheckpointState } from '../firstPerson/types';
import { THEATRE_CHAPTER_ID, THEATRE_SEED, THEATRE_SPAWN } from './definition';
import { initialTheatreProgress, initialTheatreTransient } from './state';
export function createTheatreRuntime(checkpoint?:CheckpointState,session?:number,seed=THEATRE_SEED):ChapterRuntime {
  const accepted=checkpoint?.chapterId===THEATRE_CHAPTER_ID?checkpoint:undefined;
  const base=createBaseRuntime(THEATRE_CHAPTER_ID,THEATRE_SPAWN,undefined,session),raw=accepted?.progress.theatre??initialTheatreProgress(seed);
  // Closing is an accepted atomic world operation. A cold scene reconstructs
  // its stable sealed end, while completion still needs an actual exit walk.
  const saved={...raw,light:{...raw.light},discoveries:{...raw.discoveries},story:{...raw.story},passageSealed:raw.passageSealed||raw.curtainAccepted},pose=accepted?.pose??THEATRE_SPAWN;
  return {...base,chapterId:THEATRE_CHAPTER_ID,pose:{...pose,position:{...pose.position}},progress:{...base.progress,theatre:saved,exitDoorOpen:saved.light.accepted,cleared:saved.completed},theatre:initialTheatreTransient(saved,String(base.session),pose)};
}
