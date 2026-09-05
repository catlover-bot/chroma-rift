import {
  analyzeReachability, availableMoves, createLevelState, depthAtFace, exitIsOpen,
  FLOATING_CORRIDOR, getNode, hitTestFloor, IMPOSSIBLE_BRIDGE, isBridgeActive,
  isEdgeActive, LEVELS, levelReducer, movementPath, neutralizeColor, overlapPolygon,
  pointInPolygon, projectLevel, projectPoint, projectWorld, reachabilityKey, worldDepth,
} from '..';
import type { LevelDefinition, LevelState, Point, ProjectedFace } from '..';

function finish(level: LevelDefinition, state: LevelState): LevelState {
  expect(state.move).not.toBeNull();
  return levelReducer(level, state, { type: 'moveComplete', session: state.session, token: state.move!.token });
}
function walk(level: LevelDefinition, state: LevelState, ...destinations: string[]): LevelState {
  return destinations.reduce((current, targetId) => finish(level, levelReducer(level, current, { type: 'move', targetId })), state);
}
function center(points: readonly Point[]): Point {
  return { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
}
function frontFace(point: Point, faces: readonly ProjectedFace[]): ProjectedFace | undefined {
  return [...faces].reverse().find((face) => pointInPolygon(point, face.points));
}

describe('authored 2.5D geometry', () => {
  it('projects the origin and basis with world height kept separate', () => {
    expect(projectPoint({ x: 0, y: 0, z: 0 }, 'a')).toEqual({ x: 0, y: 0 });
    expect(projectPoint({ x: 1, y: 0, z: 0 }, 'a')).toEqual({ x: 0.8, y: 0.42 });
    expect(projectPoint({ x: 0, y: 1, z: 0 }, 'a')).toEqual({ x: 0, y: -1 });
    expect(projectPoint({ x: 0, y: 0, z: 1 }, 'b')).toEqual({ x: 0.8, y: 0.42 });
  });

  it('has a 16-node first stage with a branch, a reversible dead end, loop and crossing at separate heights', () => {
    expect(FLOATING_CORRIDOR.nodes).toHaveLength(16);
    expect(FLOATING_CORRIDOR.collectibles).toHaveLength(2);
    expect(FLOATING_CORRIDOR.edges.filter((edge) => [edge.from, edge.to].includes('junction')).length).toBeGreaterThanOrEqual(3);
    expect(FLOATING_CORRIDOR.edges.filter((edge) => [edge.from, edge.to].includes('alcove'))).toHaveLength(1);
    expect(FLOATING_CORRIDOR.edges.length).toBeGreaterThanOrEqual(FLOATING_CORRIDOR.nodes.length);
    const low = getNode(FLOATING_CORRIDOR, 'underpass').position;
    const high = getNode(FLOATING_CORRIDOR, 'overpass').position;
    expect([low.x, low.z]).toEqual([high.x, high.z]);
    expect(high.y).toBeGreaterThan(low.y);
  });

  it.each(LEVELS)('$title has valid IDs, reversible normal edges and two shards', (level) => {
    expect(new Set(level.nodes.map((node) => node.id)).size).toBe(level.nodes.length);
    expect(new Set(level.edges.map((edge) => edge.id)).size).toBe(level.edges.length);
    expect(level.collectibles).toHaveLength(2);
    for (const edge of level.edges) {
      const from = getNode(level, edge.from);
      const to = getNode(level, edge.to);
      if (edge.kind !== 'projection') {
        expect(Math.hypot(from.position.x - to.position.x, from.position.z - to.position.z)).toBeCloseTo(1);
        expect(Math.abs(from.position.y - to.position.y)).toBeLessThanOrEqual(0.551);
      }
    }
  });

  it.each(LEVELS)('$title connects every touching same-height floor without an invisible wall', (level) => {
    for (let i = 0; i < level.nodes.length; i += 1) {
      for (let j = i + 1; j < level.nodes.length; j += 1) {
        const a = level.nodes[i]!;
        const b = level.nodes[j]!;
        if (a.position.y !== b.position.y) continue;
        const touching = Math.abs(a.position.x - b.position.x) + Math.abs(a.position.z - b.position.z) === 1;
        if (!touching) continue;
        expect(level.edges.some((edge) => edge.from === a.id && edge.to === b.id || edge.to === a.id && edge.from === b.id)).toBe(true);
      }
    }
  });

  it.each([320, 390, 430])('aligns the real bridge tips only at camera B with viewport width %i', (width) => {
    const level = IMPOSSIBLE_BRIDGE;
    const bridge = level.bridges[0]!;
    const edge = level.edges.find((candidate) => candidate.id === bridge.edgeId)!;
    for (const camera of level.cameras) {
      const projection = projectLevel(level, camera, width, 580);
      const a = projectWorld(bridge.endpoints[0], camera, projection);
      const b = projectWorld(bridge.endpoints[1], camera, projection);
      const aligned = Math.hypot(a.x - b.x, a.y - b.y) < 0.0001;
      expect(aligned).toBe(camera === 'b');
      expect(isBridgeActive(bridge, camera)).toBe(aligned);
      expect(isEdgeActive(level, edge, camera)).toBe(aligned);
      if (aligned) {
        expect(pointInPolygon(a, projection.floors.find((f) => f.nodeId === edge.from)!.polygon)).toBe(true);
        expect(pointInPolygon(b, projection.floors.find((f) => f.nodeId === edge.to)!.polygon)).toBe(true);
      }
    }
    expect(bridge.endpoints[0]).not.toEqual(bridge.endpoints[1]);
  });

  it.each(LEVELS)('$title painter order agrees with the depth of every overlapping face in both fixed poses', (level) => {
    for (const camera of level.cameras) {
      const { faces, occlusionFallbacks } = projectLevel(level, camera, 390, 580);
      expect(occlusionFallbacks).toEqual([]);
      for (let i = 0; i < faces.length; i += 1) {
        for (let j = i + 1; j < faces.length; j += 1) {
          const overlap = overlapPolygon(faces[i]!.points, faces[j]!.points);
          if (!overlap.length) continue;
          // Center and vertices audit both ordering and absence of crossing faces.
          for (const point of [center(overlap), ...overlap]) {
            expect(depthAtFace(faces[i]!, point) - depthAtFace(faces[j]!, point)).toBeLessThan(0.0001);
          }
        }
      }
    }
  });

  it('renders four real stair treads plus a landing and follows their heights', () => {
    const level = FLOATING_CORRIDOR;
    const projection = projectLevel(level, 'a', 390, 580);
    expect(projection.faces.filter((face) => face.nodeId === 'stair-one' && face.kind === 'top')).toHaveLength(5);
    const state = levelReducer(level, { ...createLevelState(level), currentNodeId: 'junction' }, { type: 'move', targetId: 'stair-one' });
    const path = movementPath(level, state.move!);
    expect(path[0]).toEqual(getNode(level, 'junction').position);
    expect(path[path.length - 1]).toEqual(getNode(level, 'stair-one').position);
    expect(new Set(path.map((point) => point.y)).size).toBe(5);
    const reversed = movementPath(level, { ...state.move!, from: 'stair-one', to: 'junction' });
    expect(reversed).toEqual([...path].reverse());
  });

  it.each(LEVELS)('$title stair paths keep every horizontal segment on an authored top surface', (level) => {
    const projection = projectLevel(level, 'a', 390, 580);
    for (const edge of level.edges.filter((candidate) => candidate.kind === 'stairs')) {
      const path = movementPath(level, { session: 1, token: 1, from: edge.from, to: edge.to, kind: edge.kind, edgeId: edge.id });
      for (let i = 1; i < path.length; i += 1) {
        const a = path[i - 1]!;
        const b = path[i]!;
        if (a.y !== b.y) {
          // Vertical changes are explicit risers, never a diagonal through air.
          expect([a.x, a.z]).toEqual([b.x, b.z]);
          continue;
        }
        for (const t of [0.1, 0.5, 0.9]) {
          const world = { x: a.x + (b.x - a.x) * t, y: a.y, z: a.z + (b.z - a.z) * t };
          const point = projectWorld(world, 'a', projection);
          const depth = worldDepth(world, 'a');
          const floor = projection.faces.find((face) => face.kind === 'top' && pointInPolygon(point, face.points) && Math.abs(depthAtFace(face, point) - depth) < 0.00001);
          expect(floor).toBeDefined();
        }
      }
    }
  });

  it('places the special-edge discontinuity exactly at the screen-space animation midpoint in either direction', () => {
    const level = IMPOSSIBLE_BRIDGE;
    const edge = level.edges.find((candidate) => candidate.kind === 'projection')!;
    const projection = projectLevel(level, 'b', 390, 580);
    for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      const path = movementPath(level, { session: 1, token: 1, from: from!, to: to!, kind: 'projection', edgeId: edge.id });
      const screen = path.map((point) => projectWorld(point, 'b', projection));
      expect(Math.hypot(screen[1]!.x - screen[2]!.x, screen[1]!.y - screen[2]!.y)).toBeLessThan(0.00001);
      expect(Math.hypot(screen[0]!.x - screen[1]!.x, screen[0]!.y - screen[1]!.y)).toBeCloseTo(Math.hypot(screen[2]!.x - screen[3]!.x, screen[2]!.y - screen[3]!.y));
    }
  });
});

describe('visible surface picking', () => {
  it.each(LEVELS)('$title picks only the visible front face and never through a foreground side', (level) => {
    for (const camera of level.cameras) {
      const projected = projectLevel(level, camera, 390, 580);
      for (const face of projected.faces) {
        const point = center(face.points);
        const front = frontFace(point, projected.faces)!;
        expect(hitTestFloor(point, projected)).toBe(front.kind === 'top' ? front.nodeId : undefined);
        if (front.nodeId !== face.nodeId) expect(hitTestFloor(point, projected, [face.nodeId])).toBeUndefined();
      }
    }
  });

  it('rejects a completely hidden rear floor even with a large expanded target', () => {
    const base = FLOATING_CORRIDOR.nodes[0]!;
    const level: LevelDefinition = { ...FLOATING_CORRIDOR, nodes: [
      { ...base, id: 'rear', position: { x: 0, y: 0, z: 0 } },
      { ...base, id: 'front', position: { x: 1, y: 0.84, z: 1 } },
    ], edges: [] };
    const projected = projectLevel(level, 'a', 390, 580);
    const rear = projected.floors.find((node) => node.nodeId === 'rear')!;
    expect(rear.visible).toBe(false);
    expect(hitTestFloor(rear.center, projected)).toBe('front');
    expect(hitTestFloor(rear.center, projected, ['rear'], 200)).toBeUndefined();
  });

  it('rejects off-canvas and invalid coordinates even when a floor is eligible', () => {
    const projection = projectLevel(FLOATING_CORRIDOR, 'a', 320, 500);
    for (const point of [{ x: -1, y: 10 }, { x: 321, y: 250 }, { x: 160, y: 501 }, { x: NaN, y: 0 }]) {
      expect(hitTestFloor(point, projection, undefined, 1000)).toBeUndefined();
    }
  });

  it('culls the two rear side normals and retains only top and camera-facing sides', () => {
    const level: LevelDefinition = { ...FLOATING_CORRIDOR, nodes: [FLOATING_CORRIDOR.nodes[0]!], edges: [] };
    const projection = projectLevel(level, 'a', 320, 500);
    expect(projection.faces).toHaveLength(3);
    expect(projection.faces.filter((face) => face.kind === 'top')).toHaveLength(1);
  });
});

describe('tap movement and lifecycle', () => {
  it('accepts exactly one adjacent move and rejects remote destinations and repeated taps', () => {
    const state = createLevelState(FLOATING_CORRIDOR);
    expect(levelReducer(FLOATING_CORRIDOR, state, { type: 'move', targetId: 'exit' })).toBe(state);
    const moving = levelReducer(FLOATING_CORRIDOR, state, { type: 'move', targetId: 'entry' });
    expect(moving.currentNodeId).toBe('start');
    expect(levelReducer(FLOATING_CORRIDOR, moving, { type: 'move', targetId: 'entry' })).toBe(moving);
    expect(availableMoves(FLOATING_CORRIDOR, moving)).toEqual([]);
    expect(finish(FLOATING_CORRIDOR, moving).currentNodeId).toBe('entry');
  });

  it('rejects a camera change during movement and an unsupported pose', () => {
    const level = IMPOSSIBLE_BRIDGE;
    const moving = levelReducer(level, createLevelState(level), { type: 'move', targetId: 'entry' });
    expect(levelReducer(level, moving, { type: 'camera', camera: 'b' })).toBe(moving);
    const first = createLevelState(FLOATING_CORRIDOR);
    expect(levelReducer(FLOATING_CORRIDOR, first, { type: 'camera', camera: 'b' })).toBe(first);
  });

  it('only opens the special edge at the matching camera and exposes the explicit seam path', () => {
    const level = IMPOSSIBLE_BRIDGE;
    const state = { ...createLevelState(level), currentNodeId: 'left-end' };
    expect(levelReducer(level, state, { type: 'move', targetId: 'right-end' })).toBe(state);
    const aligned = levelReducer(level, state, { type: 'camera', camera: 'b' });
    const moving = levelReducer(level, aligned, { type: 'move', targetId: 'right-end' });
    expect(moving.move?.kind).toBe('projection');
    const path = movementPath(level, moving.move!);
    expect(path).toHaveLength(4);
    expect(path.slice(1, 3)).toEqual(level.bridges[0]!.endpoints);
    expect(path[1]).not.toEqual(path[2]);
    const landed = finish(level, moving);
    expect(landed.discoveries).toContain('projection-crossing');
    expect(availableMoves(level, landed).map(({ node }) => node.id)).toContain('left-end');
  });

  it('keeps a locked exit closed until both shards and permits returning from dead ends', () => {
    const level = FLOATING_CORRIDOR;
    const nearExit = { ...createLevelState(level), currentNodeId: 'exit-approach' };
    expect(exitIsOpen(level, nearExit)).toBe(false);
    expect(levelReducer(level, nearExit, { type: 'move', targetId: 'exit' })).toBe(nearExit);
    const returned = walk(level, createLevelState(level), 'entry', 'junction', 'alcove', 'junction');
    expect(returned.currentNodeId).toBe('junction');
    expect(returned.collected).toHaveLength(1);
  });

  it('collects once on landing and ignores duplicate completion callbacks', () => {
    const level = FLOATING_CORRIDOR;
    const moving = levelReducer(level, { ...createLevelState(level), currentNodeId: 'junction' }, { type: 'move', targetId: 'alcove' });
    expect(moving.collected).toHaveLength(0);
    const completion = { type: 'moveComplete' as const, session: moving.session, token: moving.move!.token };
    const landed = levelReducer(level, moving, completion);
    expect(landed.collected).toHaveLength(1);
    expect(levelReducer(level, landed, completion)).toBe(landed);
    expect(walk(level, landed, 'junction', 'alcove').collected).toHaveLength(1);
  });

  it('cancels to the last landing on pause/background and rejects old callbacks after resume', () => {
    const level = FLOATING_CORRIDOR;
    const moving = levelReducer(level, createLevelState(level), { type: 'move', targetId: 'entry' });
    const completion = { type: 'moveComplete' as const, session: moving.session, token: moving.move!.token };
    const paused = levelReducer(level, moving, { type: 'pause' });
    expect(paused.move).toBeNull();
    expect(paused.currentNodeId).toBe('start');
    expect(levelReducer(level, paused, completion)).toBe(paused);
    const resumed = levelReducer(level, paused, { type: 'resume' });
    const next = levelReducer(level, resumed, { type: 'move', targetId: 'entry' });
    expect(next.move!.token).not.toBe(completion.token);
    expect(levelReducer(level, next, completion)).toBe(next);
    expect(finish(level, next).currentNodeId).toBe('entry');
  });

  it('restarts with a different session even if a token number is reused', () => {
    const level = FLOATING_CORRIDOR;
    const moving = levelReducer(level, createLevelState(level), { type: 'move', targetId: 'entry' });
    const completion = { type: 'moveComplete' as const, session: moving.session, token: moving.move!.token };
    const restarted = levelReducer(level, moving, { type: 'restart' });
    const next = levelReducer(level, restarted, { type: 'move', targetId: 'entry' });
    expect(next.move!.token).toBe(completion.token);
    expect(next.session).not.toBe(completion.session);
    expect(levelReducer(level, next, completion)).toBe(next);
  });

  it('clears once, permits comparison in the same composition, and resumes a cleared pause as cleared', () => {
    const level = FLOATING_CORRIDOR;
    const landed = walk(level, createLevelState(level), 'entry', 'junction', 'alcove', 'junction', 'stair-one', 'stair-two', 'upper-west', 'lookout', 'upper-north', 'overpass', 'exit-approach');
    const moving = levelReducer(level, landed, { type: 'move', targetId: 'exit' });
    const completion = { type: 'moveComplete' as const, session: moving.session, token: moving.move!.token };
    const cleared = levelReducer(level, moving, completion);
    expect(cleared.status).toBe('cleared');
    expect(levelReducer(level, cleared, completion)).toBe(cleared);
    const compared = levelReducer(level, cleared, { type: 'toggleColors' });
    expect(compared.currentNodeId).toBe(cleared.currentNodeId);
    expect(compared.camera).toBe(cleared.camera);
    expect(compared.collected).toBe(cleared.collected);
    expect(compared.status).toBe('cleared');
    const paused = levelReducer(level, compared, { type: 'pause' });
    expect(paused.status).toBe('paused');
    expect(levelReducer(level, paused, { type: 'resume' }).status).toBe('cleared');
  });
});

describe('complete-state reachability and display independence', () => {
  it.each(LEVELS)('$title is clearable and every reachable camera/position/shard state can still clear', (level) => {
    const analysis = analyzeReachability(level);
    expect(analysis.canClear).toBe(true);
    expect(analysis.winningStates.length).toBeGreaterThan(0);
    expect(analysis.unrecoverable).toEqual([]);
    expect(analysis.states.length).toBeGreaterThan(level.nodes.length);
    expect(new Set(analysis.states.map((state) => state.camera)).size).toBe(level.cameras.length);
    expect(new Set(analysis.states.map((state) => state.collected.length))).toEqual(new Set([0, 1, 2]));
  });

  it.each(LEVELS)('$title assist and color toggles preserve all reachable states', (level) => {
    const initial = createLevelState(level);
    const modified = levelReducer(level, levelReducer(level, initial, { type: 'setAssist', assist: true }), { type: 'toggleColors' });
    const standard = analyzeReachability(level, initial).states.map(reachabilityKey).sort();
    const assisted = analyzeReachability(level, modified).states.map(reachabilityKey).sort();
    expect(assisted).toEqual(standard);
    // Neither LevelDefinition nor movement rules accepts a perceptual profile.
    expect(availableMoves(level, modified).map(({ edge }) => edge.id)).toEqual(availableMoves(level, initial).map(({ edge }) => edge.id));
  });

  it('converts only pattern colors using linear-sRGB luminance and preserves grayscale values', () => {
    expect(neutralizeColor('#ff0000')).toBe('#7f7f7f');
    expect(neutralizeColor('#0000ff')).toBe('#4c4c4c');
    expect(neutralizeColor('#aaaaaa')).toBe('#aaaaaa');
    expect(neutralizeColor('#000000')).toBe('#000000');
    expect(neutralizeColor('#ffffff')).toBe('#ffffff');
    expect(neutralizeColor('transparent')).toBe('transparent');
  });
});
