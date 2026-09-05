import { stairEntry } from './projection';
import type { CameraId, FloorNode, LevelAction, LevelDefinition, LevelState, PendingMove, ProjectionBridge, Vec3, WalkEdge } from './types';

export function getNode(level: LevelDefinition, id: string): FloorNode {
  const node = level.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Unknown floor ${id} in ${level.id}`);
  return node;
}
export function isBridgeActive(bridge: ProjectionBridge, camera: CameraId): boolean {
  return camera === bridge.activeCamera;
}
export function isEdgeActive(level: LevelDefinition, edge: WalkEdge, camera: CameraId): boolean {
  if (edge.kind !== 'projection') return true;
  const bridge = level.bridges.find((candidate) => candidate.id === edge.bridgeId && candidate.edgeId === edge.id);
  return bridge !== undefined && isBridgeActive(bridge, camera);
}
export function exitIsOpen(level: LevelDefinition, state: Pick<LevelState, 'collected'>): boolean {
  return level.collectibles.every((item) => state.collected.includes(item.id));
}
export function availableMoves(level: LevelDefinition, state: LevelState): { node: FloorNode; edge: WalkEdge }[] {
  if (state.status !== 'playing') return [];
  return level.edges.flatMap((edge) => {
    if (!isEdgeActive(level, edge, state.camera)) return [];
    const target = edge.from === state.currentNodeId ? edge.to : edge.to === state.currentNodeId ? edge.from : undefined;
    if (!target || (target === level.exitId && !exitIsOpen(level, state))) return [];
    return [{ node: getNode(level, target), edge }];
  });
}
export function createLevelState(level: LevelDefinition, options: { session?: number; assist?: boolean } = {}): LevelState {
  return {
    levelId: level.id, session: options.session ?? 1, currentNodeId: level.spawnId,
    camera: level.cameras[0] ?? 'a', collected: [], discoveries: [], status: 'playing', move: null,
    nextToken: 1, neutralColors: false, assist: options.assist ?? false,
  };
}
export function levelReducer(level: LevelDefinition, state: LevelState, action: LevelAction): LevelState {
  if (state.levelId !== level.id) return state;
  switch (action.type) {
    case 'move': {
      const destination = availableMoves(level, state).find(({ node }) => node.id === action.targetId);
      if (!destination) return state;
      return { ...state, status: 'moving', nextToken: state.nextToken + 1,
        move: { session: state.session, token: state.nextToken, from: state.currentNodeId, to: destination.node.id, kind: destination.edge.kind, edgeId: destination.edge.id } };
    }
    case 'moveComplete': {
      const pending = state.move;
      if (state.status !== 'moving' || !pending || action.session !== state.session || pending.session !== action.session || pending.token !== action.token) return state;
      const collected = [...state.collected];
      for (const item of level.collectibles) {
        if (item.nodeId === pending.to && !collected.includes(item.id)) collected.push(item.id);
      }
      const discoveries = pending.kind === 'projection' && !state.discoveries.includes('projection-crossing')
        ? [...state.discoveries, 'projection-crossing'] : state.discoveries;
      const cleared = pending.to === level.exitId && exitIsOpen(level, { collected });
      return { ...state, currentNodeId: pending.to, collected, discoveries, move: null, status: cleared ? 'cleared' : 'playing' };
    }
    case 'camera': {
      if (state.status !== 'playing' || !level.cameras.includes(action.camera) || action.camera === state.camera) return state;
      const joined = level.bridges.some((bridge) => isBridgeActive(bridge, action.camera));
      return { ...state, camera: action.camera,
        discoveries: joined && !state.discoveries.includes('aligned-bridge') ? [...state.discoveries, 'aligned-bridge'] : state.discoveries };
    }
    case 'pause':
      if (state.status === 'paused') return state;
      // Cancel, keeping the last landed floor and collected items. No animation
      // callback can finish this move after resume, backgrounding or restart.
      return { ...state, status: 'paused', pausedFrom: state.status === 'cleared' ? 'cleared' : 'playing', move: null, nextToken: state.nextToken + 1 };
    case 'resume':
      return state.status === 'paused' ? { ...state, status: state.pausedFrom ?? 'playing' } : state;
    case 'restart':
      return { ...createLevelState(level, { session: state.session + 1, assist: state.assist }), neutralColors: state.neutralColors };
    case 'toggleColors':
      return { ...state, neutralColors: !state.neutralColors,
        discoveries: state.discoveries.includes('color-comparison') ? state.discoveries : [...state.discoveries, 'color-comparison'] };
    case 'setAssist':
      return state.assist === action.assist ? state : { ...state, assist: action.assist };
  }
}

export function movementPath(level: LevelDefinition, move: PendingMove): Vec3[] {
  const from = getNode(level, move.from);
  const to = getNode(level, move.to);
  if (move.kind === 'projection') {
    const edge = level.edges.find((candidate) => candidate.id === move.edgeId);
    const bridge = level.bridges.find((candidate) => candidate.edgeId === move.edgeId);
    if (!edge || !bridge) return [from.position, to.position];
    const tips = edge.from === move.from ? [...bridge.endpoints] : [...bridge.endpoints].reverse();
    // This contains an explicit discontinuity between tips. Renderers must
    // transfer at the projected seam, never interpolate the world-space gap.
    return [from.position, tips[0]!, tips[1]!, to.position];
  }
  if (move.kind !== 'stairs') return [from.position, to.position];
  const high = from.position.y > to.position.y ? from : to;
  const low = high === to ? from : to;
  const entry = stairEntry(level, high);
  if (!entry) return [from.position, to.position];
  const path: Vec3[] = [low.position];
  const half = high.size / 2;
  const rise = high.position.y - low.position.y;
  for (let i = 0; i < 4; i += 1) {
    const point = { ...high.position, [entry.axis]: high.position[entry.axis] + entry.sign * half * (1 - i / 4) };
    path.push({ ...point, y: low.position.y + rise * i / 4 });
    path.push({ ...point, y: low.position.y + rise * (i + 1) / 4 });
  }
  path.push(high.position);
  return high === to ? path : path.reverse();
}
