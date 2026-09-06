/* eslint-disable react/no-unknown-property -- These are R3F Three.js intrinsics, not DOM elements. */
import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef, type RefObject } from 'react';
import type * as THREE from 'three';

import { CEILING_BASE_Y, CEILING_THICKNESS, FLOOR_MARK, FLOOR_THICKNESS, GUIDE_FIXTURE, OBSERVATION_POSE } from '../../domain/firstPerson/chapter';
import type { ChapterRuntime, PuzzleState, Vec3, WorldGeometry } from '../../domain/firstPerson/types';
import type { SceneResources } from './resources';
import { computeSegmentTransform } from './segmentTransform';

function Segment({ from, to, width, resources, faint = false }: { from: Vec3; to: Vec3; width: number; resources: SceneResources; faint?: boolean }) {
  const transform = useMemo(() => computeSegmentTransform(from, to, width), [from, to, width]);
  return <mesh name="key-segment" geometry={resources.cylinder} material={faint ? resources.quiet : resources.key} position={transform.position} quaternion={transform.quaternion} scale={transform.scale} />;
}

export function ChapterScene({ world, runtime, progress, resources, assist, reducedMotion, lowQuality, lab, onFrameError }: {
  world: WorldGeometry; runtime: RefObject<ChapterRuntime>; progress: PuzzleState; resources: SceneResources; assist: boolean; reducedMotion: boolean; lowQuality: boolean; lab: boolean; onFrameError?: (error: unknown) => void;
}) {
  const doorA = useRef<THREE.Mesh>(null);
  const doorB = useRef<THREE.Mesh>(null);
  const doorExit = useRef<THREE.Mesh>(null);
  const guideMarker = useRef<THREE.Mesh>(null);
  const markerProgress = useRef(0);
  useFrame((_, delta) => {
    try {
      if (runtime.current.paused) return;
      if (doorA.current) doorA.current.position.y = 1.6 + runtime.current.doorAOpen * 3.3;
      if (doorB.current) doorB.current.position.y = 1.6 + runtime.current.doorBOpen * 3.3;
      if (doorExit.current) doorExit.current.position.y = 1.6 + runtime.current.doorExitOpen * 3.3;
      if (guideMarker.current) {
        if (runtime.current.progress.guideExamined) markerProgress.current = reducedMotion ? 1 : Math.min(1, markerProgress.current + Math.min(delta, 0.05) / 1.7);
        guideMarker.current.visible = runtime.current.progress.guideExamined;
        guideMarker.current.position.set(0, 0.065, -0.95 - markerProgress.current * 3.05);
      }
    } catch (error) {
      if (!onFrameError) throw error;
      onFrameError(error);
    }
  });
  return (
    <group dispose={null}>
      <ambientLight intensity={1.5} />
      <directionalLight intensity={1.7} position={[2, 6, 3]} />
      {world.floors.map((floor) => <mesh key={floor.id} geometry={resources.box} material={resources.floor} position={[(floor.minX + floor.maxX) / 2, -FLOOR_THICKNESS / 2, (floor.minZ + floor.maxZ) / 2]} scale={[floor.maxX - floor.minX, FLOOR_THICKNESS, floor.maxZ - floor.minZ]} />)}
      {world.floors.map((floor) => <mesh key={`ceiling-${floor.id}`} geometry={resources.box} material={resources.ceiling} position={[(floor.minX + floor.maxX) / 2, CEILING_BASE_Y + CEILING_THICKNESS / 2, (floor.minZ + floor.maxZ) / 2]} scale={[floor.maxX - floor.minX, CEILING_THICKNESS, floor.maxZ - floor.minZ]} />)}
      {world.solids.map((solid) => <mesh key={solid.id} {...(solid.id === 'seal-a-door' ? { ref: doorA } : solid.id === 'seal-b-door' ? { ref: doorB } : solid.id === 'exit-door' ? { ref: doorExit } : {})} geometry={resources.box} material={solid.kind === 'wall' ? resources.wall : solid.kind === 'door' ? resources.door : resources.device} position={[(solid.min.x + solid.max.x) / 2, (solid.min.y + solid.max.y) / 2, (solid.min.z + solid.max.z) / 2]} scale={[solid.max.x - solid.min.x, solid.max.y - solid.min.y, solid.max.z - solid.min.z]} />)}
      {world.colorPanels.map((panel) => <mesh key={panel.id} geometry={resources.plane} material={resources.panel} position={[(panel.minX + panel.maxX) / 2, 0.008, (panel.minZ + panel.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} scale={[panel.maxX - panel.minX, panel.maxZ - panel.minZ, 1]} />)}
      {world.solids.filter((solid) => solid.kind === 'wall').map((solid) => {
        const width = solid.max.x - solid.min.x;
        const depth = solid.max.z - solid.min.z;
        // Six millimetres of surface relief: the authored opaque wall still
        // owns the whole obstacle. Never bridge a doorway with base trim.
        return <mesh name={`base-trim-${solid.id}`} key={`trim-${solid.id}`} geometry={resources.box} material={resources.trim} position={[(solid.min.x + solid.max.x) / 2, 0.075, (solid.min.z + solid.max.z) / 2]} scale={[width + (width < depth ? 0.012 : 0), 0.15, depth + (depth <= width ? 0.012 : 0)]} />;
      })}
      {world.solids.filter((solid) => solid.kind === 'door').map((solid) => {
        const width = solid.max.x - solid.min.x;
        return <group name={`frame-${solid.id}`} key={`door-frame-${solid.id}`} position={[(solid.min.x + solid.max.x) / 2, 0, (solid.min.z + solid.max.z) / 2]}>
          <mesh geometry={resources.box} material={resources.trim} position={[-width / 2 - 0.045, 1.58, 0]} scale={[0.09, 3.16, 0.22]} />
          <mesh geometry={resources.box} material={resources.trim} position={[width / 2 + 0.045, 1.58, 0]} scale={[0.09, 3.16, 0.22]} />
          <mesh geometry={resources.box} material={resources.device} position={[0, 3.15, 0]} scale={[width + 0.18, 0.1, 0.22]} />
        </group>;
      })}
      {world.interactables.filter((item) => item.id !== 'key' && (lab || item.id === 'exit')).map((item) => <mesh key={`target-${item.id}`} geometry={resources.box} material={resources.neutral} position={[item.center.x, item.center.y, item.center.z]} rotation={[0, 0, Math.PI / 4]} scale={[0.2, 0.2, 0.06]} />)}
      {!lab ? <>
        {/* The guide's visible diameter and authored target share one definition.
            Front/back rings stay legible from either side without billboarding. */}
        <group name="guide-fixture" position={[GUIDE_FIXTURE.center.x, GUIDE_FIXTURE.center.y, GUIDE_FIXTURE.center.z]}>
          <mesh geometry={resources.cylinder} material={resources.trim} rotation={[Math.PI / 2, 0, 0]} scale={[0.2, 0.045, 0.2]} />
          <mesh name="guide-front-ring" geometry={resources.ring} material={progress.guideExamined ? resources.quiet : resources.neutral} position={[0, 0, 0.03]} scale={[GUIDE_FIXTURE.diameter / 0.78, GUIDE_FIXTURE.diameter / 0.78, 1]} />
          <mesh name="guide-back-ring" geometry={resources.ring} material={progress.guideExamined ? resources.quiet : resources.neutral} position={[0, 0, -0.03]} rotation={[0, Math.PI, 0]} scale={[GUIDE_FIXTURE.diameter / 0.78, GUIDE_FIXTURE.diameter / 0.78, 1]} />
          <mesh name="guide-status" geometry={resources.box} material={progress.guideExamined ? resources.quiet : resources.key} rotation={[0, 0, Math.PI / 4]} scale={[0.13, 0.13, 0.07]} />
        </group>
        <group name="floor-device-face">
          <mesh geometry={resources.box} material={resources.dark} position={[1.6, 0.98, -7.435]} scale={[0.68, 0.88, 0.03]} />
          <mesh name="device-status" geometry={resources.box} material={progress.sealA ? resources.neutral : resources.key} position={[1.6, 1.3, -7.408]} scale={[0.44, 0.07, 0.025]} />
          <mesh geometry={resources.box} material={resources.quiet} position={[1.6, 0.89, -7.414]} scale={[0.06, 0.46, 0.025]} />
          <mesh geometry={resources.box} material={resources.quiet} position={[1.21, 0.72, -7.444]} scale={[0.04, 1.4, 0.025]} />
          <mesh geometry={resources.box} material={resources.quiet} position={[1.99, 0.72, -7.444]} scale={[0.04, 1.4, 0.025]} />
        </group>
        {/* This same two-sided landmark remains at the original z=6 partition
            in both worlds; recognizing the entry makes its changed space clear. */}
        <group name="remembered-entry-landmark" position={[0, 0, 6]}>
          <mesh geometry={resources.box} material={resources.trim} position={[-1.09, 1.58, 0]} scale={[0.14, 3.16, 0.24]} />
          <mesh geometry={resources.box} material={resources.trim} position={[1.09, 1.58, 0]} scale={[0.14, 3.16, 0.24]} />
          <mesh geometry={resources.box} material={resources.device} position={[0, 3.14, 0]} scale={[2.32, 0.1, 0.24]} />
          <mesh name="entry-front-mark" geometry={resources.box} material={resources.neutral} position={[0, 2.96, -0.14]} rotation={[0, 0, Math.PI / 4]} scale={[0.2, 0.2, 0.04]} />
          <mesh name="entry-back-mark" geometry={resources.box} material={resources.neutral} position={[0, 2.96, 0.14]} rotation={[0, 0, Math.PI / 4]} scale={[0.2, 0.2, 0.04]} />
        </group>
        <mesh geometry={resources.ring} material={progress.markActivated ? resources.key : resources.neutral} position={[FLOOR_MARK.x, 0.012, FLOOR_MARK.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.5, 1.5, 1]} />
        <mesh geometry={resources.ring} material={resources.neutral} position={[OBSERVATION_POSE.position.x, 0.012, OBSERVATION_POSE.position.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.1, 1.1, 1]} />
        <mesh ref={guideMarker} geometry={resources.box} material={resources.neutral} scale={[0.14, 0.1, 0.14]} visible={progress.guideExamined} />
        {[-1.1, -2.05, -3, -4, -5, -6].flatMap((z, index) => [-0.2, 0.2].map((x) => <mesh key={`foot-${z}-${x}`} geometry={resources.box} material={resources.neutral} position={[x, 0.013, z + (x < 0 ? 0 : 0.18)]} rotation={[0, index % 2 ? 0.04 : -0.04, 0]} scale={[0.1, 0.008, 0.22]} />))}
        <mesh geometry={resources.plane} material={resources.dark} position={[world.keyFrame.center.x, world.keyFrame.center.y, world.keyFrame.center.z - 0.04]} scale={[world.keyFrame.width, world.keyFrame.height, 1]} />
        {world.keyFrame.outline.flatMap((line, lineIndex) => line.slice(1).map((point, index) => <Segment key={`outline-${lineIndex}-${index}`} from={line[index]!} to={point} width={0.007} resources={resources} faint />))}
        {world.keyFragments.flatMap((fragment) => fragment.points.slice(1).map((point, index) => <Segment key={`${fragment.id}-${index}`} from={fragment.points[index]!} to={point} width={fragment.strokeWidth / 2} resources={resources} />))}
        {[[-1.55, 0, 0.08, 2.8], [1.55, 0, 0.08, 2.8], [0, 1.36, 3.18, 0.08], [0, -1.36, 3.18, 0.08]].map(([x, y, width, height], index) => <mesh key={`frame-${index}`} geometry={resources.box} material={resources.device} position={[world.keyFrame.center.x + x!, world.keyFrame.center.y + y!, world.keyFrame.center.z]} scale={[width!, height!, 0.08]} />)}
        {!lowQuality ? <>
          <mesh geometry={resources.ring} material={resources.neutral} position={[-2.89, 1.65, 3.3]} rotation={[0, Math.PI / 2, 0]} scale={[1.1, 1.1, 1]} />
        </> : null}
        {assist ? <>
          <mesh geometry={resources.box} material={resources.neutral} position={[-2.38, 0.012, -4]} scale={[0.025, 0.01, 5]} />
          <mesh geometry={resources.box} material={resources.neutral} position={[2.38, 0.012, -4]} scale={[0.025, 0.01, 5]} />
        </> : null}
        {world.variant === 'exit' ? <>
          <mesh geometry={resources.box} material={resources.neutral} position={[0, 2.95, 13.77]} scale={[2.3, 0.1, 0.1]} />
        </> : null}
      </> : null}
    </group>
  );
}
