import { createTheatreRuntime, createTheatreCheckpoint, THEATRE_CHECKPOINTS } from '../../domain/theatre';
export function theatreCheckpoint(stage: 'initial' | 'light' | 'inspection' | 'accepted' | 'sealed' | 'completed' = 'initial', seed = 151) {
  const runtime = createTheatreRuntime(undefined, undefined, seed), p = runtime.progress.theatre!, live = runtime.theatre!;
  if (stage !== 'initial') {
    p.light = { rail: .65, accepted: true, attempts: 1 }; runtime.progress.exitDoorOpen = true;
    live.rail = .65; live.lastSafePose = THEATRE_CHECKPOINTS.projector;
  }
  if (stage === 'inspection') { p.inspectionShutterOpen = true; p.bypassOpen = true; p.discoveries.depth = true; }
  if (['accepted', 'sealed', 'completed'].includes(stage)) { p.curtainAccepted = true; live.lastSafePose = THEATRE_CHECKPOINTS.booth; }
  if (stage === 'sealed' || stage === 'completed') p.passageSealed = true;
  if (stage === 'completed') { p.completed = true; runtime.progress.cleared = true; live.lastSafePose = THEATRE_CHECKPOINTS.exit; }
  return createTheatreCheckpoint(runtime);
}
