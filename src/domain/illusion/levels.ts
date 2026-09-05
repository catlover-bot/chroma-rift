import type { FloorNode, LevelDefinition, WalkEdge } from './types';

function floor(
  id: string, label: string, x: number, y: number, z: number,
  kind: FloorNode['kind'] = 'floor', pattern?: FloorNode['pattern'],
): FloorNode {
  return { id, label, position: { x, y, z }, size: 1, thickness: 0.24, kind,
    ...(pattern ? { pattern } : {}) };
}
function edge(from: string, to: string, kind: WalkEdge['kind'] = 'walk'): WalkEdge {
  return { id: `${from}-${to}`, from, to, kind };
}

// Authored geometry and adjacency are independent of every perceptual profile.
export const FLOATING_CORRIDOR: LevelDefinition = {
  id: 'floating-corridor', title: '浮遊回廊',
  instruction: 'となりの床をタップして、光のかけらを2つ集めよう。',
  spawnId: 'start', exitId: 'exit', cameras: ['a'], bridges: [],
  nodes: [
    floor('start', '入口', 0, 0, 4),
    floor('entry', '入口の先', 0, 0, 3),
    floor('junction', '三つの分かれ道', 0, 0, 2, 'floor', 'bars'),
    floor('alcove', 'かけらの小部屋', -1, 0, 2),
    floor('lower-west', '下の回廊・西', 1, 0, 2),
    floor('underpass', '橋の下', 2, 0, 2),
    floor('lower-east', '下の回廊・東', 2, 0, 3),
    floor('return', '入口への回り道', 1, 0, 3),
    floor('stair-one', '階段の中ほど', 0, 0.55, 1, 'stair'),
    floor('stair-two', '上の踊り場', 0, 1.1, 0, 'stair'),
    floor('upper-west', '上の回廊・西', 1, 1.1, 0, 'floor', 'rings'),
    floor('lookout', 'かけらの見晴らし台', 2, 1.1, 0),
    floor('upper-north', '橋の手前', 2, 1.1, 1),
    floor('overpass', '上に重なる橋', 2, 1.1, 2, 'bridge', 'bars'),
    floor('exit-approach', '出口への曲がり角', 3, 1.1, 2),
    floor('exit', '出口', 3, 1.1, 3, 'exit'),
  ],
  edges: [
    edge('start', 'entry'), edge('entry', 'junction'), edge('junction', 'alcove'),
    edge('junction', 'lower-west'), edge('lower-west', 'underpass'),
    edge('lower-west', 'return'),
    edge('underpass', 'lower-east'), edge('lower-east', 'return'), edge('return', 'entry'),
    edge('junction', 'stair-one', 'stairs'), edge('stair-one', 'stair-two', 'stairs'),
    edge('stair-two', 'upper-west'), edge('upper-west', 'lookout'),
    edge('lookout', 'upper-north'), edge('upper-north', 'overpass'),
    edge('overpass', 'exit-approach'), edge('exit-approach', 'exit'),
  ],
  collectibles: [{ id: 'corridor-shard-one', nodeId: 'alcove' }, { id: 'corridor-shard-two', nodeId: 'lookout' }],
};

export const IMPOSSIBLE_BRIDGE: LevelDefinition = {
  id: 'impossible-bridge', title: 'つながらない橋',
  instruction: '視点を変えて、橋をつなごう。',
  spawnId: 'start', exitId: 'exit', cameras: ['a', 'b'],
  nodes: [
    floor('start', '高い島の入口', -2, 1.68, 3),
    floor('entry', '高い島の回廊', -2, 1.68, 2),
    floor('junction', '高い島の分かれ道', -2, 1.68, 1, 'floor', 'rings'),
    floor('alcove', 'かけらの小部屋', -3, 1.68, 1),
    floor('left-approach', '橋へ向かう床', -1, 1.68, 1),
    floor('left-end', '高い島の橋端', 0, 1.68, 1, 'bridge', 'bars'),
    floor('loop', '高い島の回り道', -1, 1.68, 2),
    floor('right-end', '低い島の橋端', 3, 0, -1, 'bridge', 'bars'),
    floor('right-corner', '低い島の曲がり角', 4, 0, -1),
    floor('garden', 'かけらの庭', 4, 0, 0, 'floor', 'rings'),
    floor('right-junction', '低い島の分かれ道', 3, 0, 0),
    floor('stair', '出口への階段', 3, 0.55, 1, 'stair'),
    floor('exit', '出口', 3, 1.1, 2, 'exit'),
  ],
  edges: [
    edge('start', 'entry'), edge('entry', 'junction'), edge('junction', 'alcove'),
    edge('junction', 'left-approach'), edge('left-approach', 'left-end'),
    edge('entry', 'loop'), edge('loop', 'left-approach'),
    { id: 'perspective-crossing', from: 'left-end', to: 'right-end', kind: 'projection', bridgeId: 'joined-ends' },
    edge('right-end', 'right-corner'), edge('right-corner', 'garden'),
    edge('garden', 'right-junction'), edge('right-junction', 'right-end'),
    edge('right-junction', 'stair', 'stairs'), edge('stair', 'exit', 'stairs'),
  ],
  bridges: [{
    id: 'joined-ends', edgeId: 'perspective-crossing', activeCamera: 'b',
    // In B, delta=(2,-1.68,-2) lies precisely on the projection's view ray.
    // These are separate physical tips, NOT a continuous world-space floor.
    endpoints: [{ x: 0.5, y: 1.68, z: 1 }, { x: 2.5, y: 0, z: -1 }],
  }],
  collectibles: [{ id: 'bridge-shard-one', nodeId: 'alcove' }, { id: 'bridge-shard-two', nodeId: 'garden' }],
};

export const LEVELS: readonly LevelDefinition[] = [FLOATING_CORRIDOR, IMPOSSIBLE_BRIDGE];
