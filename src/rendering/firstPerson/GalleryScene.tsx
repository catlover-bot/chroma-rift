/* eslint-disable react/no-unknown-property -- R3F scene intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { createContourSpec, createShadowSpec, CONTOUR_DISC_IDS, GALLERY_A_OBSERVATION_POSE, GALLERY_CONTOUR_FIXTURE, GALLERY_CONTOUR_OBSERVATION_POSE, GALLERY_EMBLEM_FIXTURE, GALLERY_EMBLEM_LATCH, GALLERY_EMBLEM_SWITCHES, GALLERY_OBSERVATION_POSE, GALLERY_SHADOW_FIXTURE, GALLERY_SHADOW_OBSERVATION_POSE, SHADOW_SAMPLE_SIZE, SHADOW_SLOT_POSITIONS, angularDifference, CONTOUR_TOLERANCE } from '../../domain/gallery';
import type { SampleId } from '../../domain/gallery';
import { evaluateKeyAlignment } from '../../domain/firstPerson/alignment';
import { getWorld } from '../../domain/firstPerson/chapter';
import type { ChapterRuntime, CollisionVolume, PuzzleState, Vec3, WorldGeometry } from '../../domain/firstPerson/types';
import type { SceneResources } from './resources';
import { computeSegmentTransform } from './segmentTransform';
import { GlyphMark } from './GlyphMark';

type Block = { position: [number, number, number]; scale: [number, number, number] };
function InstancedBlocks({ blocks, resources, material, name }: { blocks: Block[]; resources: SceneResources; material: THREE.Material; name: string }) {
  const object = useMemo(() => {
    const mesh = new THREE.InstancedMesh(resources.box, material, blocks.length);
    const transform = new THREE.Object3D();
    blocks.forEach((b, i) => { transform.position.fromArray(b.position); transform.scale.fromArray(b.scale); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.name = name;
    return mesh;
  }, [blocks, material, name, resources.box]);
  useEffect(() => () => object.dispose(), [object]);
  return <primitive object={object} dispose={null} />;
}
function boxBlock(s: CollisionVolume): Block {
  return { position: [(s.min.x + s.max.x) / 2, (s.min.y + s.max.y) / 2, (s.min.z + s.max.z) / 2], scale: [s.max.x - s.min.x, s.max.y - s.min.y, s.max.z - s.min.z] };
}
function Segment({ from, to, width, material, resources, name }: { from: Vec3; to: Vec3; width: number; material: THREE.Material; resources: SceneResources; name: string }) {
  const t = computeSegmentTransform(from, to, width);
  return <mesh name={name} geometry={resources.cylinder} material={material} position={t.position} quaternion={t.quaternion} scale={t.scale} />;
}
export function GalleryScene({ world, runtime, progress, resources, reducedMotion, onFrameError }: {
  world: WorldGeometry; runtime: RefObject<ChapterRuntime>; progress: PuzzleState; resources: SceneResources; reducedMotion: boolean; onFrameError?: (e: unknown) => void;
}) {
  const r = resources.galleryResources!, gp = progress.gallery!;
  const doors = useRef<Record<string, THREE.Mesh | null>>({});
  const samples = useRef<Partial<Record<SampleId, THREE.Group | null>>>({});
  const discs = useRef<(THREE.Mesh | null)[]>([]);
  const discNotches = useRef<(THREE.Mesh | null)[]>([]);
  const switches = useRef<(THREE.Group | null)[]>([]);
  const latchA = useRef<THREE.Mesh>(null), drawerB = useRef<THREE.Mesh>(null), drawerC = useRef<THREE.Mesh>(null), keyLatch = useRef<THREE.Mesh>(null);
  const guide = useRef<THREE.Group>(null);
  const keyNotch = useRef<THREE.Mesh>(null), exitHandle = useRef<THREE.Mesh>(null);
  const shadow = createShadowSpec(gp.shadow.seed, gp.shadow.variant), contour = createContourSpec(gp.contour.seed);
  useFrame(({ camera }) => {
    try {
      const state = runtime.current, g = state.gallery;
      if (!g) return;
      r.setComparison(g.shadowCompare);
      if (guide.current) guide.current.visible = g.contourGuide;
      for (const solid of getWorld(state).solids) {
        const mesh = doors.current[solid.id]; if (mesh) mesh.position.y = (solid.min.y + solid.max.y) / 2;
      }
      for (const sample of shadow.samples) {
        const mesh = samples.current[sample.id];
        if (!mesh) continue;
        const drag = g.activeDrag;
        const p = drag?.kind === 'shadow' && drag.sampleId === sample.id ? drag.point : SHADOW_SLOT_POSITIONS[state.progress.gallery!.shadow.assignments[sample.id]];
        mesh.position.set(p.x, p.y, .013);
      }
      CONTOUR_DISC_IDS.forEach(id => {
        if (discs.current[id]) discs.current[id]!.rotation.z = g.contourAngles[id];
        if (discNotches.current[id]) discNotches.current[id]!.material = angularDifference(g.contourAngles[id], contour.discs[id]!.targetAngle) <= CONTOUR_TOLERANCE ? r.warm : r.shelf;
      });
      GALLERY_EMBLEM_SWITCHES.forEach((item, i) => {
        const mesh = switches.current[i]; if (!mesh) return;
        const correct = state.progress.sealA && resources.emblemSurface!.stimulus.answer === item.glyph;
        const f = state.switchFeedback;
        const press = correct ? 1 : f?.glyph === item.glyph ? reducedMotion ? Number(f.remainingSeconds > .15) : Math.min(1, f.remainingSeconds / .35) : 0;
        mesh.position.z = item.center.z - .055 * press;
      });
      if (latchA.current) latchA.current.position.x = GALLERY_EMBLEM_LATCH.center.x + state.doorAOpen * .24;
      if (drawerB.current) drawerB.current.position.z = GALLERY_SHADOW_FIXTURE.center.z + .09 + .22 * g.doorShadowOpen;
      if (drawerC.current) drawerC.current.position.z = GALLERY_CONTOUR_FIXTURE.center.z + .09 + .22 * g.doorContourOpen;
      if (keyLatch.current) keyLatch.current.position.x = world.keyFrame.center.x + .65 + state.doorBOpen * .32;
      if (exitHandle.current) exitHandle.current.position.y = 1.2 + state.doorExitOpen * 3.3;
      if (keyNotch.current) {
        const alignment = evaluateKeyAlignment(state.pose, world, { view: camera.matrixWorldInverse.elements, projection: camera.projectionMatrix.elements }, state.alignment);
        const approach = Number.isFinite(alignment.error) ? Math.max(0, 1 - alignment.error / .22) : 0;
        keyNotch.current.position.x = world.keyFrame.center.x + 1.48 - .1 * approach;
        keyNotch.current.material = state.alignment ? r.outline : r.warm;
      }
    } catch (e) { if (onFrameError) onFrameError(e); else throw e; }
  });
  const floorBlocks = world.floors.map(f => ({ position: [(f.minX + f.maxX) / 2, -.12, (f.minZ + f.maxZ) / 2], scale: [f.maxX - f.minX, .24, f.maxZ - f.minZ] } as Block));
  const ceilings = floorBlocks.map(b => ({ ...b, position: [b.position[0], 3.3, b.position[2]] as Block['position'] }));
  const walls = world.solids.filter(s => s.kind === 'wall');
  const frames: Block[] = [];
  for (const door of world.solids.filter(s => s.kind === 'door')) {
    const b = boxBlock(door), alongX = b.scale[0] >= b.scale[2];
    for (const sign of [-1, 1]) frames.push({ position: [b.position[0] + (alongX ? sign * (b.scale[0] / 2 + .055) : 0), 1.6, b.position[2] + (alongX ? 0 : sign * (b.scale[2] / 2 + .055))], scale: [.11, 3.2, .24] });
    frames.push({ position: [b.position[0], 3.15, b.position[2]], scale: alongX ? [b.scale[0] + .22, .12, .24] : [.24, .12, b.scale[2] + .22] });
  }
  const fixtures = [GALLERY_SHADOW_FIXTURE, GALLERY_CONTOUR_FIXTURE];
  return <group name="perception-gallery" dispose={null}>
    <ambientLight intensity={1.4} /><directionalLight intensity={1.35} position={[2, 6, 3]} />
    <InstancedBlocks name="gallery-floors" blocks={floorBlocks} resources={resources} material={resources.floor} />
    <InstancedBlocks name="gallery-ceilings" blocks={ceilings} resources={resources} material={resources.ceiling} />
    {[r.roomA, r.roomB, r.roomC, r.roomD].map((material, i) => <InstancedBlocks key={i} name={'gallery-walls-' + i} resources={resources} material={material}
      blocks={walls.filter(s => ((s.min.z < -17 ? 3 : s.max.x < -3 ? 1 : s.min.x > 5 ? 2 : 0) === i)).map(boxBlock)} />)}
    <InstancedBlocks name="gallery-floor-edges" blocks={walls.map(s => { const b = boxBlock(s); return { position: [b.position[0], .08, b.position[2]], scale: [b.scale[0] + .015, .16, b.scale[2] + .015] } as Block; })} resources={resources} material={resources.trim} />
    <InstancedBlocks name="gallery-door-frames" blocks={frames} resources={resources} material={r.warm} />
    {world.solids.filter(s => s.kind === 'door').map(s => { const b = boxBlock(s); return <mesh key={s.id} name={s.id} ref={m => { doors.current[s.id] = m; }} geometry={resources.box} material={resources.door} position={b.position} scale={b.scale} />; })}
    <InstancedBlocks name="gallery-notched-frame" resources={resources} material={r.warm}
      blocks={world.solids.filter(s => s.id.startsWith('gallery-notched-frame')).map(boxBlock)} />
    <mesh name="gallery-emblem-frame" geometry={resources.box} material={r.warm} position={[1.95, 2.02, -7.86]} scale={[1.56, 1.56, .1]} />
    <mesh name="emblem-plate" geometry={resources.plane} material={resources.emblemSurface!.material} position={[1.95, 2.02, -7.81]} scale={[GALLERY_EMBLEM_FIXTURE.width, GALLERY_EMBLEM_FIXTURE.height, 1]} />
    {GALLERY_EMBLEM_SWITCHES.map((item, i) => <group key={item.id}>
      <mesh geometry={resources.box} material={r.warm} position={[item.center.x, item.center.y, -7.88]} scale={[.46, .46, .12]} />
      <group name={'emblem-switch-' + item.glyph} ref={m => { switches.current[i] = m; }} position={[item.center.x, item.center.y, item.center.z]}>
        <mesh geometry={resources.box} material={resources.dark} position={[0, 0, -.02]} scale={[.35, .35, .025]} /><GlyphMark glyph={item.glyph} resources={resources} />
      </group>
    </group>)}
    <mesh name="emblem-latch" ref={latchA} geometry={resources.box} material={r.outline} position={[GALLERY_EMBLEM_LATCH.center.x, GALLERY_EMBLEM_LATCH.center.y, GALLERY_EMBLEM_LATCH.center.z]} scale={[.38, .08, .09]} />
    {[GALLERY_A_OBSERVATION_POSE, GALLERY_SHADOW_OBSERVATION_POSE, GALLERY_CONTOUR_OBSERVATION_POSE, GALLERY_OBSERVATION_POSE].map((p, i) => <mesh key={i} name={'gallery-observation-' + i} geometry={resources.ring} material={r.outline} position={[p.position.x, .012, p.position.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.1, 1.1, 1]} />)}
    <group name="hub-four-seals" position={[0, 2.3, -13.8]}>
      {[progress.sealA, gp.shadow.solved, gp.contour.solved, progress.sealB].map((solved, i) => <mesh key={i} geometry={resources.box} material={solved ? r.outline : r.warm} position={[(i - 1.5) * .34, 0, 0]} rotation={[0, 0, i * Math.PI / 8]} scale={[.22, .22, .1]} />)}
    </group>
    {fixtures.map((f, i) => <group key={i} name={i ? 'contour-architecture' : 'shadow-architecture'}>
      <InstancedBlocks name={i ? 'contour-body' : 'shadow-body'} resources={resources} material={i ? resources.device : resources.trim}
        blocks={world.solids.filter(s => s.id === (i ? 'contour-panel-body' : 'shadow-panel-body')).map(boxBlock)} />
      <mesh name={i ? 'contour-drawer' : 'shadow-latch'} ref={i ? drawerC : drawerB} geometry={resources.box} material={r.warm} position={[f.center.x, .65, f.center.z + .09]} scale={[.9, .2, .22]} />
    </group>)}
    <group name="shadow-panel" position={[GALLERY_SHADOW_FIXTURE.center.x, GALLERY_SHADOW_FIXTURE.center.y, GALLERY_SHADOW_FIXTURE.center.z]}>
      <mesh name="shadow-context" geometry={resources.plane} material={r.shadowPanel} scale={[2.4, 1.8, 1]} />
      {(['socket-left', 'socket-right'] as const).map(slot => <mesh name={slot} key={slot} geometry={resources.ring} material={r.outline} position={[SHADOW_SLOT_POSITIONS[slot].x, SHADOW_SLOT_POSITIONS[slot].y, .005]} scale={[.52, .52, 1]} />)}
      {shadow.samples.map(sample => {
        const point = SHADOW_SLOT_POSITIONS[gp.shadow.assignments[sample.id]];
        return <group key={sample.id} name={sample.id} ref={m => { samples.current[sample.id] = m; }} position={[point.x, point.y, .013]}>
          <mesh name={sample.id + '-border'} geometry={resources.plane} material={r.outline} position={[0, 0, -.001]} scale={[SHADOW_SAMPLE_SIZE + .025, SHADOW_SAMPLE_SIZE + .025, 1]} />
          <mesh name={sample.id + '-interior'} geometry={resources.plane} material={r.sampleMaterials[sample.color as keyof typeof r.sampleMaterials]} scale={[SHADOW_SAMPLE_SIZE, SHADOW_SAMPLE_SIZE, 1]} />
        </group>;
      })}
      {/* The sparse shelf/window divisions surround, never tint, sample interiors. */}
      <InstancedBlocks name="shadow-shelf" resources={resources} material={resources.trim} blocks={[-1.18, -.4, .4, 1.18].map(x => ({ position: [x, .26, -.002], scale: [.025, 1.12, .01] }))} />
    </group>
    <group name="contour-panel" position={[GALLERY_CONTOUR_FIXTURE.center.x, GALLERY_CONTOUR_FIXTURE.center.y, GALLERY_CONTOUR_FIXTURE.center.z]}>
      <mesh name="contour-uniform-background" geometry={resources.plane} material={r.bright} scale={[2.4, 1.8, 1]} />
      {contour.discs.map(disc => <group key={disc.id} position={[disc.center.x, disc.center.y, .006]}>
        {/* A short exterior notch remains outside the entire central triangle. */}
        <mesh name={'contour-notch-' + disc.id} ref={m => { discNotches.current[disc.id] = m; }} geometry={resources.box} material={r.shelf}
          position={[-Math.cos(disc.targetAngle) * (disc.radius + .055), -Math.sin(disc.targetAngle) * (disc.radius + .055), 0]} rotation={[0, 0, disc.targetAngle]} scale={[.04, .018, .006]} />
        <mesh name={'contour-disc-' + disc.id} ref={m => { discs.current[disc.id] = m; }} geometry={r.inducer} material={r.ink} rotation={[0, 0, runtime.current.gallery!.contourAngles[disc.id]]} position={[0, 0, .004]} />
      </group>)}
      <group ref={guide} name="contour-guide-only" visible={runtime.current.gallery!.contourGuide}>
        {contour.discs.flatMap((disc, i) => {
          const a = disc.center, b = contour.discs[(i + 1) % 3]!.center;
          return Array.from({ length: 8 }, (_, j) => {
            const t = j / 8, end = (j + .5) / 8;
            return <Segment key={i + '-' + j} name="contour-guide-dash" resources={resources} material={r.guide} width={.004}
              from={{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: .02 }} to={{ x: a.x + (b.x - a.x) * end, y: a.y + (b.y - a.y) * end, z: .02 }} />;
          });
        })}
      </group>
    </group>
    <mesh name="key-backing" geometry={resources.plane} material={resources.dark} position={[world.keyFrame.center.x, world.keyFrame.center.y, world.keyFrame.center.z - .04]} scale={[world.keyFrame.width, world.keyFrame.height, 1]} />
    {world.keyFrame.outline.flatMap((line, l) => line.slice(1).map((point, i) => <Segment name="key-outline" key={l + '-' + i} from={line[i]!} to={point} width={.008} material={resources.quiet} resources={resources} />))}
    {world.keyFragments.flatMap(fragment => fragment.points.slice(1).map((point, i) => <Segment name="key-segment" key={fragment.id + i} from={fragment.points[i]!} to={point} width={fragment.strokeWidth / 2} material={resources.key} resources={resources} />))}
    <mesh name="key-approach-notch" ref={keyNotch} geometry={resources.box} material={r.warm} position={[world.keyFrame.center.x + 1.48, 1.6, world.keyFrame.center.z + .04]} scale={[.12, .065, .08]} />
    <mesh name="key-mechanical-latch" ref={keyLatch} geometry={resources.box} material={r.warm} position={[world.keyFrame.center.x + .65, .65, world.keyFrame.center.z + .02]} scale={[.45, .1, .13]} />
    <InstancedBlocks name="key-tall-frame" resources={resources} material={r.warm} blocks={[-1, 1].map(sign => ({ position: [world.keyFrame.center.x + sign * 1.57, 1.6, world.keyFrame.center.z], scale: [.12, 2.95, .13] }))} />
    {world.variant === 'exit' ? <mesh name="gallery-final-door-handle" ref={exitHandle} geometry={resources.box} material={r.outline} position={[.45, 1.2 + runtime.current.doorExitOpen * 3.3, 13.77]} scale={[.1, .28, .1]} /> : null}
  </group>;
}
