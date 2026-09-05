import { Canvas, Circle, Group, Line, Oval, Path, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { cancelAnimation, Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  getNode, isBridgeActive, movementPath, projectWorld, stairEntry,
  type FloorNode, type LevelDefinition, type LevelState, type Point, type ProjectedLevel,
} from '../domain/illusion';
import { UI_COLORS } from '../theme/ui';
import { illusionPalette, type PreferredColor } from './IllusionPalette';
import type { ExplorerFacing } from './IllusionMotion';

export type IllusionMazeCanvasProps = {
  width: number;
  height: number;
  level: LevelDefinition;
  state: LevelState;
  projection: ProjectedLevel;
  destinationIds: string[];
  preferredColor: PreferredColor;
  effectStrength: 'low' | 'medium' | 'high';
  reducedMotion: boolean;
  facing?: ExplorerFacing;
  onTap: (point: Point) => void;
  onTravelComplete: (session: number, token: number) => void;
};

function polygon(points: readonly Point[]): string {
  return points.length ? `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} Z` : '';
}

function panelPoint(node: FloorNode, u: number, v: number) {
  return { x: node.position.x + u * node.size, y: node.position.y + 0.005, z: node.position.z + v * node.size };
}

function FloorDetails({ node, level, state, projection, eligible, colors }: {
  node: FloorNode; level: LevelDefinition; state: LevelState; projection: ProjectedLevel; eligible: boolean; colors: string[];
}) {
  const project = (u: number, v: number) => projectWorld(panelPoint(node, u, v), state.camera, projection);
  const center = project(0, 0);
  const radius = Math.max(3, projection.scale * 0.085);
  const availableCollectible = level.collectibles.find((item) => item.nodeId === node.id && !state.collected.includes(item.id));
  const exitOpen = state.collected.length === level.collectibles.length;
  const stair = stairEntry(level, node);
  const landingMinimum = stair?.sign === 1 ? -0.35 : 0.04;
  const landingMaximum = stair?.sign === 1 ? -0.04 : 0.35;
  const threshold = stair
    ? stair.axis === 'x'
      ? [project(landingMinimum, -0.2), project(landingMaximum, -0.2), project(landingMaximum, 0.2), project(landingMinimum, 0.2)]
      : [project(-0.25, landingMinimum), project(0.25, landingMinimum), project(0.25, landingMaximum), project(-0.25, landingMaximum)]
    : [project(-0.25, -0.2), project(0.25, -0.2), project(0.25, 0.2), project(-0.25, 0.2)];
  const bridge = level.bridges.find((candidate) => {
    const edge = level.edges.find((item) => item.id === candidate.edgeId);
    return edge?.from === node.id || edge?.to === node.id;
  });
  const bridgeEdge = bridge ? level.edges.find((edge) => edge.id === bridge.edgeId) : undefined;
  const tip = bridge ? projectWorld(bridge.endpoints[bridgeEdge?.from === node.id ? 0 : 1], state.camera, projection) : undefined;
  return (
    <Group>
      {node.pattern ? [-0.23, 0, 0.23].map((offset, index) => {
        const line = node.pattern === 'rings'
          ? [project(offset, -0.24), project(offset + 0.11, -0.08), project(offset, 0.08), project(offset - 0.11, -0.08)]
          : [project(offset - 0.052, -0.34), project(offset + 0.052, -0.34), project(offset + 0.052, 0.34), project(offset - 0.052, 0.34)];
        return <Path key={index} path={polygon(line)} color={colors[index % 2] ?? '#B5B5B5'} style={node.pattern === 'rings' ? 'stroke' : 'fill'} strokeWidth={2.5} />;
      }) : null}
      {state.assist && eligible ? (
        <Group>
          {projection.faces.filter((face) => face.nodeId === node.id && face.kind === 'top').map((face) => <Path key={`assist-${face.id}`} path={polygon(face.points)} color="#DEE0D8" style="stroke" strokeWidth={1.8} />)}
          <Circle cx={center.x} cy={center.y} r={radius} color="#E6E7DF" />
        </Group>
      ) : null}
      {tip && bridge ? <Path path={polygon([{ x: tip.x, y: tip.y - 4 }, { x: tip.x + 4, y: tip.y }, { x: tip.x, y: tip.y + 4 }, { x: tip.x - 4, y: tip.y }])} color={isBridgeActive(bridge, state.camera) ? '#D9DECE' : '#A4ADA9'} style="stroke" strokeWidth={isBridgeActive(bridge, state.camera) ? 2 : 1} /> : null}
      {availableCollectible ? (
        <Group>
          <Oval x={center.x - radius * 1.4} y={center.y - radius * 0.25} width={radius * 2.8} height={radius} color="#35383B" />
          <Path path={polygon([{ x: center.x, y: center.y - radius * 4 }, { x: center.x + radius, y: center.y - radius * 2.4 }, { x: center.x, y: center.y - radius * 0.8 }, { x: center.x - radius, y: center.y - radius * 2.4 }])} color="#F0E4BE" />
          <Line p1={vec(center.x, center.y - radius * 3.6)} p2={vec(center.x, center.y - radius * 1.2)} color="#FFF8DF" strokeWidth={1} />
        </Group>
      ) : null}
      {node.id === level.exitId ? (
        <Group>
          <Path path={polygon(threshold)} color={exitOpen ? '#D6D7C7' : '#41474A'} />
          <Line p1={vec(center.x - radius * 2, center.y)} p2={vec(center.x - radius * 2, center.y - radius * 6)} color="#BFC3BD" strokeWidth={radius * 1.1} />
          <Line p1={vec(center.x + radius * 2, center.y)} p2={vec(center.x + radius * 2, center.y - radius * 6)} color="#848E8B" strokeWidth={radius * 1.1} />
          <Line p1={vec(center.x - radius * 2.55, center.y - radius * 6)} p2={vec(center.x + radius * 2.55, center.y - radius * 6)} color="#C8CDC4" strokeWidth={radius * 1.1} />
          {!exitOpen ? <Line p1={vec(center.x - radius * 1.5, center.y - radius * 2.5)} p2={vec(center.x + radius * 1.5, center.y - radius * 2.5)} color="#949A94" strokeWidth={2} /> : null}
        </Group>
      ) : null}
    </Group>
  );
}

/** Original little hooded surveyor: planted boots, a cloak, a hood and a directional visor. */
function Explorer({ points, progress, scale, moving, reducedMotion, slot, facing }: {
  points: Point[]; progress: SharedValue<number>; scale: number; moving: boolean; reducedMotion: boolean; slot: 'source' | 'target' | 'only'; facing: ExplorerFacing;
}) {
  const size = Math.max(0.68, Math.min(scale / 48, 1.05));
  const lengths = useMemo(() => points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y)), [points]);
  const totalDistance = lengths.reduce((sum, length) => sum + length, 0);
  const transform = useDerivedValue(() => {
    let remaining = totalDistance * progress.value;
    let position = points[points.length - 1] ?? { x: 0, y: 0 };
    for (let index = 0; index < lengths.length; index += 1) {
      const length = lengths[index] ?? 0;
      if (remaining <= length && length > 0) {
        const start = points[index]!;
        const end = points[index + 1]!;
        position = { x: start.x + (end.x - start.x) * remaining / length, y: start.y + (end.y - start.y) * remaining / length };
        break;
      }
      remaining -= length;
    }
    return [{ translateX: position.x }, { translateY: position.y }, { scale: size }];
  });
  const opacity = useDerivedValue(() => slot === 'only' || (slot === 'source' ? progress.value < 0.5 : progress.value >= 0.5) ? 1 : 0);
  const bodyTransform = useDerivedValue(() => [{ translateY: moving && !reducedMotion ? -Math.abs(Math.sin(progress.value * Math.PI * 3)) * 1.8 : 0 }]);
  const leftFootY = useDerivedValue(() => moving && !reducedMotion ? -3 - Math.max(0, Math.sin(progress.value * Math.PI * 4)) * 2.2 : -3);
  const rightFootY = useDerivedValue(() => moving && !reducedMotion ? -3 - Math.max(0, -Math.sin(progress.value * Math.PI * 4)) * 2.2 : -3);
  return (
    <Group transform={transform} opacity={opacity}>
      <Oval x={-9} y={-2} width={18} height={6} color="#22282D" />
      <RoundedRect x={-6} y={leftFootY} width={5} height={5} r={1.5} color="#C2CBC8" />
      <RoundedRect x={2} y={rightFootY} width={5} height={5} r={1.5} color="#E0E6DE" />
      <Group transform={bodyTransform}>
        <Path path="M -5 -18 L 5 -18 L 8 -5 L -7 -5 Z" color="#E0E5DB" />
        <Path path="M -5 -18 L -2 -18 L -3 -5 L -7 -5 Z" color="#A6B4B1" />
        <RoundedRect x={-7} y={-30} width={14} height={15} r={5} color="#F1F2E7" />
        <RoundedRect x={facing > 0 ? -1 : -5} y={-25} width={6} height={5} r={2} color="#353E43" />
        <Circle cx={facing > 0 ? 3 : -3} cy={-22.5} r={0.8} color="#E8E9DC" />
        <Path path={facing > 0 ? 'M -4 -16 L -10 -13 L -6 -12 Z' : 'M 4 -16 L 10 -13 L 6 -12 Z'} color="#929F9D" />
      </Group>
    </Group>
  );
}

export function IllusionMazeCanvas({ width, height, level, state, projection, destinationIds, preferredColor, effectStrength, reducedMotion, facing = 1, onTap, onTravelComplete }: IllusionMazeCanvasProps) {
  const progress = useSharedValue(0);
  const move = state.move;
  const colors = illusionPalette(preferredColor, state.neutralColors, effectStrength);
  const points = useMemo(() => {
    const positions = move ? movementPath(level, move) : [getNode(level, state.currentNodeId).position];
    return positions.map((position) => projectWorld(position, state.camera, projection));
  }, [level, move, projection, state.camera, state.currentNodeId]);

  useEffect(() => {
    progress.value = 0;
    if (!move || state.status !== 'moving') return;
    const { session, token } = move;
    progress.value = withTiming(1, { duration: reducedMotion ? 100 : move.kind === 'projection' ? 700 : 400, easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) scheduleOnRN(onTravelComplete, session, token);
    });
    return () => cancelAnimation(progress);
  }, [move, onTravelComplete, progress, reducedMotion, state.status]);

  const tapGesture = useMemo(() => Gesture.Tap().runOnJS(true).onEnd((event) => onTap({ x: event.x, y: event.y })), [onTap]);
  const sourceId = move?.from ?? state.currentNodeId;
  const targetId = move?.to;
  const lastFaceByNode = new Map(projection.faces.map((face, index) => [face.nodeId, index]));
  const drawExplorer = (nodeId: string) => {
    if (nodeId !== sourceId && nodeId !== targetId) return null;
    return <Explorer points={points} progress={progress} scale={projection.scale} moving={!!move} reducedMotion={reducedMotion} slot={!move ? 'only' : nodeId === sourceId ? 'source' : 'target'} facing={facing} />;
  };

  return (
    <GestureDetector gesture={tapGesture}>
      <View style={{ width, height }} testID="illusion-maze-canvas" accessible={false} importantForAccessibility="no-hide-descendants">
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={width} height={height} color={UI_COLORS.background} />
          <Oval x={width * 0.16} y={height * 0.77} width={width * 0.68} height={height * 0.09} color="#101216" />
          {projection.faces.map((face, faceIndex) => {
            const node = getNode(level, face.nodeId);
            const top = face.kind === 'top';
            const fill = top ? node.kind === 'stair' ? '#747C7C' : node.kind === 'bridge' ? '#737B7C' : '#697273' : face.shade === 'left' ? '#353D42' : '#464F54';
            return (
              <Group key={face.id}>
                <Path path={polygon(face.points)} color={fill} />
                <Path path={polygon(face.points)} color={top ? '#9BA4A1' : '#535E61'} style="stroke" strokeWidth={0.7} />
                {lastFaceByNode.get(node.id) === faceIndex ? <FloorDetails node={node} level={level} state={state} projection={projection} eligible={destinationIds.includes(node.id)} colors={colors} /> : null}
                {lastFaceByNode.get(node.id) === faceIndex ? drawExplorer(node.id) : null}
              </Group>
            );
          })}
        </Canvas>
      </View>
    </GestureDetector>
  );
}
