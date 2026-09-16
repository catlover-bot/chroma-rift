import { createController } from '../runtimeController';
import { presentChapterAudio } from '../chapterAudio';
import type { StageSession as Mirror } from '../../../domain/stages/mirror-corridor-v1/session';
import type { StageSession as Departure } from '../../../domain/stages/departure-control-v1/session';

function fixture(id = 'mirror-corridor-v1') {
  const controller = createController(undefined, false, true, id);
  const audio = { event: jest.fn(), setMusicState: jest.fn(), advanceMusic: jest.fn(), setEnvironment: jest.fn(), duckMusic: jest.fn() };
  controller.audio = audio as unknown as NonNullable<typeof controller.audio>;
  controller.diagnostics.appActive = true;
  return { controller, audio };
}
test('one presented key/grip/tooth transition emits once and cold/owner replacement stays quiet', () => {
  const { controller:c, audio } = fixture();
  presentChapterAudio(c, .05);
  let live = c.runtime.stageSession!.value as Mirror;
  c.runtime.stageSession!.value = { ...live, keyTaken:true, practiced:true, holding:'winch', ratchets:1 };
  presentChapterAudio(c, .05); presentChapterAudio(c, .05);
  expect(audio.event.mock.calls.map(([e]) => e.type)).toEqual(['key','grip','ratchet']);
  expect(audio.event.mock.calls.map(([e]) => e.sequence)).toEqual([1,2,3]);
  c.audio = { ...audio, event:jest.fn() } as unknown as NonNullable<typeof c.audio>;
  presentChapterAudio(c, .05);
  expect(c.audio.event).not.toHaveBeenCalled();
  live = c.runtime.stageSession!.value as Mirror;
  c.runtime = { ...c.runtime, session:c.runtime.session+1, stageSession:{stageId:live.stageId,value:{...live,ratchets:2}} };
  presentChapterAudio(c,.05);
  expect(c.audio.event).not.toHaveBeenCalled();
});
test('a throwing backend cannot replay the committed physical event on the next observation', () => {
  const { controller:c, audio } = fixture();
  presentChapterAudio(c,.05);
  c.runtime.stageSession!.value = {...c.runtime.stageSession!.value as Mirror,keyTaken:true};
  audio.event.mockImplementationOnce(()=>{throw new Error('device unavailable');});
  expect(()=>presentChapterAudio(c,.05)).toThrow('device unavailable');
  presentChapterAudio(c,.05);
  expect(audio.event).toHaveBeenCalledTimes(1);
});
test('isolation immediately chooses release over stale hostile state, power silences indoor machinery, outdoors changes ambience', () => {
  const { controller:c, audio } = fixture('departure-control-v1');
  let live = c.runtime.stageSession!.value as Departure;
  c.runtime.stageSession!.value = {...live,actor:{...live.actor,phase:'pursue'}};
  presentChapterAudio(c,.05);
  expect(audio.setMusicState).toHaveBeenLastCalledWith('pursuit',String(c.runtime.session));
  live = c.runtime.stageSession!.value as Departure;
  c.runtime.stageSession!.value = {...live,keyAvailable:false,keyInstalled:true,procedureRead:true,isolated:true,doorProgress:1,doorMode:'idle'};
  presentChapterAudio(c,.05);
  expect(audio.setMusicState).toHaveBeenLastCalledWith('release',String(c.runtime.session));
  live = c.runtime.stageSession!.value as Departure;
  c.runtime.stageSession!.value = {...live,stopped:true};
  presentChapterAudio(c,.05);
  expect(audio.setEnvironment).toHaveBeenLastCalledWith('silent');
  c.runtime.pose = {...c.runtime.pose,position:{x:0,y:1.6,z:22.4}};
  presentChapterAudio(c,.05);
  expect(audio.setEnvironment).toHaveBeenLastCalledWith('outdoor');
  for (let i=0;i<220;i++) presentChapterAudio(c,.05);
  expect(audio.setMusicState).toHaveBeenLastCalledWith('exploration',String(c.runtime.session));
  expect(audio.event.mock.calls.filter(([e])=>e.type==='power')).toHaveLength(1);
});
test('background, pause and retired owners never advance music or dispatch cues', () => {
  const { controller:c, audio } = fixture();
  c.runtime.paused=true; presentChapterAudio(c,.05);
  c.runtime.paused=false;c.diagnostics.appActive=false;presentChapterAudio(c,.05);
  c.diagnostics.appActive=true;c.retired=true;presentChapterAudio(c,.05);
  expect(audio.advanceMusic).not.toHaveBeenCalled();expect(audio.event).not.toHaveBeenCalled();
});
