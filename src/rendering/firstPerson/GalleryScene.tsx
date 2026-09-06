/* eslint-disable react/no-unknown-property -- R3F scene intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { createContourSpec, createShadowSpec, CONTOUR_DISC_IDS, GALLERY_CHROMATIC_FIXTURE, GALLERY_DISPLAY_POSITION, GALLERY_WIRING_OBSERVATION_POSE, GALLERY_MASK_WINDOW_FIXTURE, GALLERY_FINAL_DOOR_FIXTURE, GALLERY_LIGHT_FIXTURE, GALLERY_EXIT_PANEL_FIXTURE, GALLERY_CONTOUR_FIXTURE, GALLERY_CONTOUR_OBSERVATION_POSE, GALLERY_SHADOW_FIXTURE, GALLERY_SHADOW_OBSERVATION_POSE, SHADOW_SAMPLE_SIZE, SHADOW_SLOT_POSITIONS, shadowSlotAt, angularDifference, CONTOUR_TOLERANCE } from '../../domain/gallery';
import type { SampleId, SocketId } from '../../domain/gallery';
import { getWorld } from '../../domain/firstPerson/chapter';
import { createPanelFixture } from '../../domain/firstPerson/panelFixture';
import type { ChapterRuntime, CollisionVolume, PuzzleState, Vec3, WorldGeometry } from '../../domain/firstPerson/types';
import type { SceneResources } from './resources';
import { computeSegmentTransform } from './segmentTransform';
import { PerceptualGalleryExhibits } from './PerceptualGalleryExhibits';
import { GalleryActor } from './GalleryActor';
import { PanelFixture } from './PanelFixture';

const shadowFixture = createPanelFixture(GALLERY_SHADOW_FIXTURE), contourFixture = createPanelFixture(GALLERY_CONTOUR_FIXTURE);
const lightFixture = createPanelFixture(GALLERY_LIGHT_FIXTURE), exitFixture = createPanelFixture(GALLERY_EXIT_PANEL_FIXTURE), colorFixture = createPanelFixture(GALLERY_CHROMATIC_FIXTURE);
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
function SquareFrame({ resources, material, size, name }: { resources: SceneResources; material: THREE.Material; size: number; name: string }) {
  return <group name={name}>{[-1, 1].flatMap(sign => [
    <mesh key={'h' + sign} geometry={resources.box} material={material} position={[0, sign * size / 2, 0]} scale={[size + .025, .025, .006]} />,
    <mesh key={'v' + sign} geometry={resources.box} material={material} position={[sign * size / 2, 0, 0]} scale={[.025, size, .006]} />,
  ])}</group>;
}
function setFrame(group: THREE.Group | null | undefined, material: THREE.Material) {
  group?.traverse(child => { if (child instanceof THREE.Mesh) child.material = material; });
}
export function GalleryScene({ world, runtime, progress, resources, reducedMotion, onFrameError }: {
  world: WorldGeometry; runtime: RefObject<ChapterRuntime>; progress: PuzzleState; resources: SceneResources; reducedMotion: boolean; onFrameError?: (e: unknown) => void;
}) {
  const r = resources.galleryResources!, gp = progress.gallery!;
  const doors = useRef<Record<string, THREE.Mesh | null>>({});
  const samples = useRef<Partial<Record<SampleId, THREE.Group | null>>>({});
  const sampleFrames = useRef<Partial<Record<SampleId, THREE.Group | null>>>({});
  const trays = useRef<Partial<Record<SocketId, THREE.Group | null>>>({});
  const discs = useRef<(THREE.Mesh | null)[]>([]), discNotches = useRef<(THREE.Mesh | null)[]>([]);
  const maskWindowHandle = useRef<THREE.Mesh>(null);
  const drawerB = useRef<THREE.Group>(null), drawerC = useRef<THREE.Group>(null);
  const guide = useRef<THREE.Group>(null), lever = useRef<THREE.Group>(null), exitHandle = useRef<THREE.Mesh>(null);
  const shadow = createShadowSpec(gp.shadow.seed, gp.shadow.variant), contour = createContourSpec(gp.contour.seed);
  useFrame(() => {
    try {
      const state = runtime.current, g = state.gallery;
      if (!g) return;
      r.setComparison(g.shadowCompare);
      r.chromaticSurface.update(g.chromaticNeutral);
      if (guide.current) guide.current.visible = g.contourGuide;
      for (const solid of getWorld(state).solids) {
        const mesh = doors.current[solid.id];
        if (mesh) {
          mesh.position.y = (solid.min.y + solid.max.y) / 2;
          if (solid.id === 'exit-door') {
            const left = g.exitClosureSeconds, elapsed = .6 - left;
            mesh.position.z = (solid.min.z + solid.max.z) / 2 + (!reducedMotion && left > 0 ? Math.sin(elapsed * 28) * .006 * left / .6 : 0);
          }
        }
      }
      const drag = g.activeDrag;
      const candidate = drag?.kind === 'shadow' ? shadowSlotAt(drag.point) : null;
      for (const slot of ['socket-left', 'socket-right'] as const) setFrame(trays.current[slot], candidate === slot ? r.selected : r.outline);
      for (const sample of shadow.samples) {
        const mesh = samples.current[sample.id];
        if (!mesh) continue;
        const held = drag?.kind === 'shadow' && drag.sampleId === sample.id;
        const p = held ? drag.point : SHADOW_SLOT_POSITIONS[state.progress.gallery!.shadow.assignments[sample.id]];
        mesh.position.set(p.x, p.y, .013);
        // Only the outer frame changes; interior RGB and depth stay constant.
        setFrame(sampleFrames.current[sample.id], held ? candidate ? r.selected : r.ink : r.outline);
        if (sampleFrames.current[sample.id]) sampleFrames.current[sample.id]!.scale.setScalar(held ? 1.08 : 1);
      }
      CONTOUR_DISC_IDS.forEach(id => {
        if (discs.current[id]) discs.current[id]!.rotation.z = g.contourAngles[id];
        if (discNotches.current[id]) discNotches.current[id]!.material = drag?.kind === 'contour' && drag.discId === id ? r.selected :
          angularDifference(g.contourAngles[id], contour.discs[id]!.targetAngle) <= CONTOUR_TOLERANCE ? r.warm : r.shelf;
      });
      if (drawerB.current) drawerB.current.position.z = GALLERY_SHADOW_FIXTURE.center.z + .09 + .22 * g.doorShadowOpen;
      if (drawerC.current) drawerC.current.position.z = GALLERY_CONTOUR_FIXTURE.center.z + .09 + .22 * g.doorContourOpen;
      if (maskWindowHandle.current) maskWindowHandle.current.position.y = GALLERY_MASK_WINDOW_FIXTURE.center.y + (state.progress.gallery!.maskWindowOpen ? 1.6 : 0);
      if (lever.current) lever.current.rotation.x = state.progress.gallery!.emergencyLit ? -.5 : .5;
      if (exitHandle.current) exitHandle.current.position.y = 1.2 + state.doorExitOpen * 3.3;
    } catch (e) { if (onFrameError) onFrameError(e); else throw e; }
  });
  const floorBlocks = world.floors.map(f => ({ position: [(f.minX + f.maxX) / 2, -.12, (f.minZ + f.maxZ) / 2], scale: [f.maxX - f.minX, .24, f.maxZ - f.minZ] } as Block));
  const ceilings = floorBlocks.map(b => ({ ...b, position: [b.position[0], 3.3, b.position[2]] as Block['position'] }));
  const walls = world.solids.filter(s => s.kind === 'wall');
  const fixtures = [GALLERY_SHADOW_FIXTURE, GALLERY_CONTOUR_FIXTURE];
  const pathLights: Block[] = [
    ...[1, -2, -5, -8, -10].map(z => ({ position: [.9, .017, z], scale: [.3, .025, .07] } as Block)),
    ...[-5, -7, 5, 7, 9].map(x => ({ position: [x, .017, -10], scale: [.07, .025, .3] } as Block)),
    ...[8, 10, 12, 14, 16, 18, 20, 22].map(z => ({ position: [4.75, .017, z], scale: [.1, .025, .3] } as Block)),
  ];
  return <group name="closed-gallery" dispose={null}>
    <PerceptualGalleryExhibits runtime={runtime} resources={resources} />
    <GalleryActor runtime={runtime} resources={resources} reducedMotion={reducedMotion} />
    <ambientLight intensity={1.4} /><directionalLight intensity={1.35} position={[2, 6, 3]} />
    <InstancedBlocks name="gallery-floors" blocks={floorBlocks} resources={resources} material={resources.floor} />
    <InstancedBlocks name="gallery-ceilings" blocks={ceilings} resources={resources} material={resources.ceiling} />
    {[r.roomA, r.roomB, r.roomC, r.roomD].map((material, i) => <InstancedBlocks key={i} name={'gallery-walls-' + i} resources={resources} material={material}
      blocks={walls.filter(s => (s.min.z > 5 ? 3 : s.max.x < -3 ? 1 : s.min.x > 5 && s.min.z < 0 ? 2 : 0) === i).map(boxBlock)} />)}
    <InstancedBlocks name="gallery-floor-edges" blocks={walls.map(s => { const b = boxBlock(s); return { position: [b.position[0], .08, b.position[2]], scale: [b.scale[0] + .015, .16, b.scale[2] + .015] } as Block; })} resources={resources} material={resources.trim} />
    <InstancedBlocks name="gallery-wall-panels" resources={resources} material={resources.trim} blocks={walls.map(s => {
      const b = boxBlock(s); return { position: [b.position[0], .65, b.position[2]], scale: [b.scale[0] + .009, 1.0, b.scale[2] + .009] } as Block;
    })} />
    <InstancedBlocks name="gallery-wall-joints" resources={resources} material={r.shelf} blocks={walls.flatMap(s => {
      const b = boxBlock(s), alongX = b.scale[0] > b.scale[2], length = Math.max(b.scale[0], b.scale[2]);
      return Array.from({ length: Math.max(0, Math.floor(length / 2) - 1) }, (_, i) => ({
        position: [alongX ? s.min.x + (i + 1) * 2 : b.position[0], .65, alongX ? b.position[2] : s.min.z + (i + 1) * 2],
        scale: [alongX ? .028 : b.scale[0] + .013, .94, alongX ? b.scale[2] + .013 : .028],
      } as Block));
    })} />
    <InstancedBlocks name="gallery-route-lights" resources={resources} material={gp.emergencyLit ? r.selected : r.shelf} blocks={pathLights} />
    {world.solids.filter(s => s.kind === 'door' || s.id === 'mask-window-body').map(s => { const b = boxBlock(s); return <mesh key={s.id} name={s.id} ref={m => { doors.current[s.id] = m; }} geometry={resources.box} material={resources.door} position={b.position} scale={b.scale} />; })}
    <InstancedBlocks name="gallery-retreat-shelves" resources={resources} material={resources.device} blocks={world.solids.filter(s => s.id.includes('shelf')).map(boxBlock)} />
    <InstancedBlocks name="gallery-mask-cabinet" resources={resources} material={resources.trim} blocks={world.solids.filter(s => s.id.startsWith('gallery-mask-')).map(boxBlock)} />
    <mesh ref={maskWindowHandle} name="gallery-mask-window-handle" geometry={resources.box} material={r.outline} position={[GALLERY_MASK_WINDOW_FIXTURE.center.x, GALLERY_MASK_WINDOW_FIXTURE.center.y + (gp.maskWindowOpen ? 1.6 : 0), GALLERY_MASK_WINDOW_FIXTURE.center.z + .025]} scale={[.26, .055, .09]} />
    <mesh name="gallery-empty-plinth" geometry={resources.box} material={r.shelf} position={[GALLERY_DISPLAY_POSITION.x, .025, GALLERY_DISPLAY_POSITION.z]} scale={[.8, .05, .75]} />
    <PanelFixture name="gallery-light" fixture={lightFixture} box={resources.box} plane={resources.plane} surface={resources.device} backing={resources.dark} frame={r.warm} />
    <group position={[-.72, 1.55, 5.73]} rotation={[0, Math.PI, 0]}>
      <group ref={lever} name="emergency-light-lever" rotation={[gp.emergencyLit ? -.5 : .5, 0, 0]}>
        <mesh geometry={resources.box} material={r.selected} position={[0, .12, .055]} scale={[.4, .14, .14]} />
        <mesh geometry={resources.box} material={r.ink} position={[0, 0, .02]} scale={[.06, .22, .06]} />
      </group>
    </group>
    <PanelFixture name="gallery-exit-panel" fixture={exitFixture} box={resources.box} plane={resources.plane} surface={resources.device} backing={resources.dark} frame={r.warm} />
    <group name="exit-power-sockets" position={[.72, 1.55, 5.74]} rotation={[0, Math.PI, 0]}>
      {(['shadow', 'contour'] as const).map((puzzle, i) => <group key={puzzle} position={[(i - .5) * .28, 0, 0]}>
        <mesh geometry={resources.box} material={resources.dark} scale={[.24, .31, .025]} />
        {gp.powerConnected ? <mesh name={'connected-' + puzzle + '-power'} geometry={resources.box} material={r.outline} position={[0, 0, .08]} scale={[.18, .24, .12]} /> : null}
      </group>)}
    </group>
    <PanelFixture name="chromatic-exhibit" fixture={colorFixture} box={resources.box} plane={resources.plane} surface={r.chromaticSurface.material} backing={resources.dark} frame={r.warm} />
    {[GALLERY_SHADOW_OBSERVATION_POSE, GALLERY_CONTOUR_OBSERVATION_POSE, GALLERY_WIRING_OBSERVATION_POSE].map((p, i) => <mesh key={i} name={'gallery-observation-' + i} geometry={resources.ring} material={r.outline} position={[p.position.x, .012, p.position.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.1, 1.1, 1]} />)}
    <group name="hub-two-powers" position={[0, 2.3, -13.8]}>
      {(['shadow', 'contour'] as const).map((puzzle, i) => <mesh key={puzzle} name={'hub-' + puzzle + '-power'} geometry={resources.box} material={gp.powerTaken[puzzle] ? r.outline : r.shelf} position={[(i - .5) * .45, 0, 0]} scale={[.22, .3, .1]} />)}
    </group>
    <PanelFixture name="shadow" fixture={shadowFixture} box={resources.box} plane={resources.plane} surface={r.shadowPanel} backing={resources.dark} frame={resources.trim} />
    <PanelFixture name="contour" fixture={contourFixture} box={resources.box} plane={resources.plane} surface={r.bright} backing={resources.dark} frame={resources.trim} />
    {fixtures.map((f, i) => {
      const puzzle = i ? 'contour' : 'shadow';
      return <group key={puzzle} name={puzzle + '-drawer'} ref={i ? drawerC : drawerB} position={[f.center.x, .65, f.center.z + .09 + .22 * (i ? runtime.current.gallery!.doorContourOpen : runtime.current.gallery!.doorShadowOpen)]}>
        <mesh geometry={resources.box} material={r.warm} scale={[.9, .18, .24]} />
        <mesh name={puzzle + '-drawer-handle'} geometry={resources.box} material={r.outline} position={[0, -.02, .15]} scale={[.32, .055, .06]} />
        {gp[puzzle].solved && !gp.powerTaken[puzzle] ? <group name={puzzle + '-power'} position={[0, .17, 0]}>
          <mesh geometry={resources.box} material={r.outline} scale={[.18, .24, .16]} />
          <mesh geometry={resources.box} material={resources.dark} position={[0, .13, 0]} scale={[.1, .04, .07]} />
        </group> : null}
      </group>;
    })}
    <group name="shadow-panel" position={[GALLERY_SHADOW_FIXTURE.center.x, GALLERY_SHADOW_FIXTURE.center.y, GALLERY_SHADOW_FIXTURE.center.z]}>
      {(['socket-left', 'socket-right'] as const).map(slot => <group ref={m => { trays.current[slot] = m; }} name={slot} key={slot} position={[SHADOW_SLOT_POSITIONS[slot].x, SHADOW_SLOT_POSITIONS[slot].y, .005]}>
        <SquareFrame name={slot + '-square-tray'} size={.5} resources={resources} material={r.outline} />
      </group>)}
      {shadow.samples.map(sample => {
        const point = SHADOW_SLOT_POSITIONS[gp.shadow.assignments[sample.id]];
        return <group key={sample.id} name={sample.id} ref={m => { samples.current[sample.id] = m; }} position={[point.x, point.y, .013]}>
          <group ref={m => { sampleFrames.current[sample.id] = m; }}>
            <SquareFrame name={sample.id + '-outer-frame'} size={SHADOW_SAMPLE_SIZE + .04} resources={resources} material={r.outline} />
            <mesh name={sample.id + '-handle'} geometry={resources.box} material={r.outline} position={[0, .24, 0]} scale={[.14, .05, .01]} />
          </group>
          <mesh name={sample.id + '-interior'} geometry={resources.plane} material={r.sampleMaterials[sample.color as keyof typeof r.sampleMaterials]} scale={[SHADOW_SAMPLE_SIZE, SHADOW_SAMPLE_SIZE, 1]} />
        </group>;
      })}
    </group>
    <group name="contour-panel" position={[GALLERY_CONTOUR_FIXTURE.center.x, GALLERY_CONTOUR_FIXTURE.center.y, GALLERY_CONTOUR_FIXTURE.center.z]}>
      {contour.discs.map(disc => <group key={disc.id} position={[disc.center.x, disc.center.y, .006]}>
        <mesh name={'contour-notch-' + disc.id} ref={m => { discNotches.current[disc.id] = m; }} geometry={resources.box} material={r.shelf}
          position={[-Math.cos(disc.targetAngle) * (disc.radius + .025), -Math.sin(disc.targetAngle) * (disc.radius + .025), 0]} rotation={[0, 0, disc.targetAngle]} scale={[.03, .018, .006]} />
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
    <mesh name="gallery-final-door-handle" ref={exitHandle} geometry={resources.box} material={r.outline} position={[3.55, 1.2 + runtime.current.doorExitOpen * 3.3, GALLERY_FINAL_DOOR_FIXTURE.center.z]} scale={[.1, .28, .1]} />
    <mesh name="gallery-exit-sign" geometry={resources.box} material={r.exitSign} position={[4, 2.9, 22.82]} scale={[.85, .25, .035]} />
  </group>;
}
