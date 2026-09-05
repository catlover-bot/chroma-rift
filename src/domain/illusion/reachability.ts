import { availableMoves, createLevelState, levelReducer } from './state';
import type { LevelDefinition, LevelState } from './types';

export function reachabilityKey(state: LevelState): string {
  return `${state.currentNodeId}|${state.camera}|${[...state.collected].sort().join(',')}`;
}
export function reachableSuccessors(level: LevelDefinition, state: LevelState): LevelState[] {
  if (state.status === 'cleared') return [];
  const moves = availableMoves(level, state).map(({ node }) => {
    const moving = levelReducer(level, state, { type: 'move', targetId: node.id });
    return levelReducer(level, moving, { type: 'moveComplete', session: moving.session, token: moving.move!.token });
  });
  const cameras = level.cameras.filter((camera) => camera !== state.camera).map((camera) => levelReducer(level, state, { type: 'camera', camera }));
  return [...moves, ...cameras];
}

/** Exhaustively checks this small finite puzzle, including both views and shard subsets. */
export function analyzeReachability(level: LevelDefinition, initial = createLevelState(level)): {
  states: readonly LevelState[]; winningStates: readonly LevelState[]; unrecoverable: readonly LevelState[]; canClear: boolean;
} {
  const seen = new Map<string, LevelState>([[reachabilityKey(initial), initial]]);
  const queue = [initial];
  const predecessors = new Map<string, Set<string>>();
  for (let index = 0; index < queue.length; index += 1) {
    const state = queue[index]!;
    const key = reachabilityKey(state);
    for (const successor of reachableSuccessors(level, state)) {
      const next = reachabilityKey(successor);
      const previous = predecessors.get(next) ?? new Set<string>();
      previous.add(key);
      predecessors.set(next, previous);
      if (!seen.has(next)) { seen.set(next, successor); queue.push(successor); }
    }
  }
  const winningStates = queue.filter((state) => state.status === 'cleared');
  const recoverable = new Set(winningStates.map(reachabilityKey));
  const backwards = [...recoverable];
  for (let index = 0; index < backwards.length; index += 1) {
    for (const previous of predecessors.get(backwards[index]!) ?? []) {
      if (!recoverable.has(previous)) { recoverable.add(previous); backwards.push(previous); }
    }
  }
  return { states: queue, winningStates, unrecoverable: queue.filter((state) => !recoverable.has(reachabilityKey(state))), canClear: recoverable.has(reachabilityKey(initial)) };
}
