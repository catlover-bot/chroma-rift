/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ChapterRuntime, WorldGeometry } from '../../domain/firstPerson/types';
import { VAULT_BRAKE_POSE, VAULT_FLOORS, VAULT_LENGTH_POSE, VAULT_METAL_FLOORS, VAULT_SOLIDS } from '../../domain/vault/definition';
import { getVaultWorld } from '../../domain/vault/world';
import { GalleryActor } from './GalleryActor';
import type { SceneResources } from './resources';
import { VaultCafeWall, VaultLengthDevice, VaultRodDevice } from './VaultDevices';

type Block = { position: [number, number, number]; scale: [number, number, number] };
/** Shared box geometry and instanced static architecture; only four gate meshes
 * move. Allocation and React work happen at mount, never on a simulation tick. */
function Blocks({ blocks, resources, material, name }: { blocks: readonly Block[]; resources: SceneResources; material: THREE.Material; name: string }) {
  const object = useMemo(() => {
    const mesh = new THREE.InstancedMesh(resources.box, material, blocks.length), t = new THREE.Object3D();
    blocks.forEach((block, i) => { t.position.fromArray(block.position); t.scale.fromArray(block.scale); t.updateMatrix(); mesh.setMatrixAt(i, t.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.name = name;
    return mesh;
  }, [blocks, resources.box, material, name]);
  useEffect(() => () => object.dispose(), [object]);
  return <primitive object={object} dispose={null} />;
}
const floors: Block[] = VAULT_FLOORS.map(f => ({ position: [(f.minX + f.maxX) / 2, -.12, (f.minZ + f.maxZ) / 2], scale: [f.maxX - f.minX, .24, f.maxZ - f.minZ] }));
const ceilings: Block[] = floors.map(b => ({ ...b, position: [b.position[0], 3.3, b.position[2]] }));
const walls: Block[] = VAULT_SOLIDS.filter(s => !s.id.includes('rack')).map(s => ({ position: [(s.min.x + s.max.x) / 2, (s.min.y + s.max.y) / 2, (s.min.z + s.max.z) / 2],
  scale: [s.max.x - s.min.x, s.max.y - s.min.y, s.max.z - s.min.z] }));
const rackBodies: Block[] = VAULT_SOLIDS.filter(s => s.id.includes('rack')).map(s => ({
  position: [(s.min.x + s.max.x) / 2, (s.min.y + s.max.y) / 2, (s.min.z + s.max.z) / 2],
  scale: [s.max.x - s.min.x, s.max.y - s.min.y, s.max.z - s.min.z],
}));
const rackFaces: Block[] = VAULT_SOLIDS.filter(s => s.id.includes('rack')).flatMap(s => {
  const x = (s.min.x + s.max.x) / 2, z = (s.min.z + s.max.z) / 2, width = s.max.x - s.min.x, depth = s.max.z - s.min.z;
  return [.2, .8, 1.45, 2.15].map(y => ({ position: [x, y, z] as Block['position'], scale: [width + .018, .065, depth + .018] as Block['scale'] }));
});
const metal: Block[] = VAULT_METAL_FLOORS.map(f => ({ position: [(f.minX + f.maxX) / 2, .008, (f.minZ + f.maxZ) / 2], scale: [f.maxX - f.minX, .016, f.maxZ - f.minZ] }));
const lights: Block[] = [
  { position: [-1.15, 2.8, 3.6], scale: [1.6, .07, .06] },
  { position: [-4.8, 2.55, 8], scale: [.06, .13, .7] },
  { position: [4.8, 2.55, 16], scale: [.06, .13, .7] },
  { position: [-8.6, 2.85, 18.5], scale: [.06, .08, 1.3] },
  { position: [3, 2.75, 27.8], scale: [1.15, .08, .07] },
];
const gateFrames: Block[] = [ [0, 5, 2], [3, 20, 3], [3, 23.7, 3], [3, 27.6, 3] ].flatMap(([x, z, width]) => [
  { position: [x! - width! / 2, 1.55, z!] as Block['position'], scale: [.10, 3.1, .22] as Block['scale'] },
  { position: [x! + width! / 2, 1.55, z!] as Block['position'], scale: [.10, 3.1, .22] as Block['scale'] },
  { position: [x!, 3.1, z!] as Block['position'], scale: [width! + .1, .10, .22] as Block['scale'] },
]);
// Flat original shelf endcaps and wall-mounted outlines distinguish junctions.
// Every volume lies on an existing solid face; navigation and gates are unchanged.
const landmarkEnds: Block[] = [
  { position: [0, 1.2, 8.991], scale: [2.85, .12, .025] },
  { position: [0, 1.8, 8.991], scale: [2.85, .12, .025] },
  { position: [0, .6, 8.991], scale: [2.85, .12, .025] },
  ...[-.34, 0, .34].map(x => ({ position: [3.8 + x, 1.2, 14.241] as Block['position'], scale: [.11, 1.85, .025] as Block['scale'] })),
  { position: [-3.45, .9, 12.241], scale: [1.1, .65, .025] },
  { position: [-3.45, 1.75, 12.241], scale: [.55, .45, .025] },
];
const tallFrame: Block[] = [
  { position: [-4.895, 1.35, 10.55], scale: [.025, 2.7, .12] },
  { position: [-4.895, 1.35, 11.95], scale: [.025, 2.7, .12] },
  { position: [-4.895, 2.68, 11.25], scale: [.025, .12, 1.5] },
  { position: [-4.895, .08, 11.25], scale: [.025, .12, 1.5] },
];
const floorBreaks: Block[] = [
  { position: [-3.35, .012, 6.35], scale: [2.65, .012, .09] },
  { position: [3.1, .012, 6.35], scale: [3.25, .012, .09] },
  { position: [0, .012, 17.25], scale: [3.1, .012, .12] },
  { position: [-1.15, .012, -1.61], scale: [1.3, .012, .035] },
  { position: [-1.15, .012, -.99], scale: [1.3, .012, .035] },
  { position: [-1.8, .012, -1.3], scale: [.035, .012, .65] },
  { position: [-.5, .012, -1.3], scale: [.035, .012, .65] },
];
export function VaultScene({ world, runtime, resources, reducedMotion, onFrameError }: {
  world: WorldGeometry; runtime: RefObject<ChapterRuntime>; resources: SceneResources; reducedMotion: boolean; onFrameError?: ((error: unknown) => void) | undefined;
}) {
  const r = resources.vaultResources!, doors = useRef<Record<string, THREE.Group | null>>({}), impact = useRef<THREE.Mesh>(null);
  const gateDefinitions = useMemo(() => world.solids.filter(s => s.kind === 'door'), [world]);
  useFrame(() => {
    try {
    const current = runtime.current, live = current.vault;
    if (!live) return;
    for (const solid of getVaultWorld(current).solids) {
      const group = doors.current[solid.id];
      if (group) group.position.y = (solid.min.y + solid.max.y) / 2;
    }
    // A small raised rib flexes after the solid door has finished closing.
    // The door's root, collider, camera and the individual behind it stay fixed.
    if (impact.current) {
      const age = 1.4 - live.exitClosureSeconds;
      impact.current.position.z = .105 + (!reducedMotion && current.progress.cleared && age >= .3 && age <= .6 ? Math.sin((age - .3) / .3 * Math.PI) * .018 : 0);
    }
    } catch (error) { if (onFrameError) onFrameError(error); else throw error; }
  });
  return <group name="uncanny-vault" dispose={null}>
    <ambientLight intensity={1.25} /><directionalLight intensity={1.1} position={[-1, 5, 3]} />
    <Blocks name="vault-floors" blocks={floors} resources={resources} material={r.floor} />
    <Blocks name="vault-ceilings" blocks={ceilings} resources={resources} material={resources.ceiling} />
    <Blocks name="vault-solid-walls-and-shelves" blocks={walls} resources={resources} material={r.wall} />
    <Blocks name="vault-covered-inventory" blocks={rackBodies} resources={resources} material={r.cloth} />
    <Blocks name="vault-distinct-shelf-endcaps" blocks={landmarkEnds} resources={resources} material={r.board} />
    <Blocks name="vault-tall-wall-frame" blocks={tallFrame} resources={resources} material={r.guide} />
    <Blocks name="vault-floor-junctions-and-observation-area" blocks={floorBreaks} resources={resources} material={resources.quiet} />
    <Blocks name="vault-shelf-ledges" blocks={rackFaces} resources={resources} material={r.rack} />
    <Blocks name="vault-physical-metal-floor" blocks={metal} resources={resources} material={r.rack} />
    <Blocks name="vault-work-lamps" blocks={lights} resources={resources} material={resources.neutral} />
    <Blocks name="vault-gate-frames" blocks={gateFrames} resources={resources} material={resources.trim} />
    {gateDefinitions.map(s => {
      const width = s.max.x - s.min.x, depth = s.max.z - s.min.z, height = s.max.y - s.min.y;
      return <group key={s.id} name={s.id} ref={g => { doors.current[s.id] = g; }}
        position={[(s.min.x + s.max.x) / 2, (s.min.y + s.max.y) / 2, (s.min.z + s.max.z) / 2]}>
        {/* The exact solid dimensions include the entry grille openings. */}
        <mesh name={s.id + '-solid'} geometry={resources.box} material={resources.door} scale={[width, height, depth]} />
        {s.id === 'vault-final-door' ? <mesh name="vault-door-impact-rib" ref={impact} geometry={resources.box} material={r.rack} position={[0, .15, .105]} scale={[2.1, .09, .035]} /> : null}
      </group>;
    })}
    <VaultLengthDevice runtime={runtime} resources={resources} onFrameError={onFrameError} />
    <VaultRodDevice runtime={runtime} resources={resources} onFrameError={onFrameError} />
    <VaultCafeWall runtime={runtime} resources={resources} onFrameError={onFrameError} />
    <GalleryActor name="vault-exhibit-actor" onFrameError={onFrameError} runtime={runtime} resources={resources} reducedMotion={reducedMotion} actorSource={() => runtime.current.vault?.actor} />
    {[VAULT_LENGTH_POSE, VAULT_BRAKE_POSE].map((pose, i) => <mesh key={i} name={'vault-observation-mark-' + i}
      geometry={resources.ring} material={resources.quiet} position={[pose.position.x, .015, pose.position.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.35, 1.35, 1]} />)}
    {/* Two large pull handles remain reachable below the raised doors. Their
        fixed cables visibly connect them to the same actual gate housings. */}
    {[[3, 27.72, .65], [3.8, 23.82, .48]].map(([x, z, width], i) => <group key={i} name={i === 0 ? 'vault-exit-pull-fixture' : 'vault-partition-pull-fixture'}>
      <mesh geometry={resources.box} material={resources.galleryResources!.warm} position={[x!, 1.4, z!]} scale={[width!, .12, .10]} />
      <mesh geometry={resources.box} material={resources.trim} position={[x!, 2.25, z!]} scale={[.02, 1.6, .025]} />
      <mesh geometry={resources.box} material={resources.neutral} position={[x!, 2.93, z!]} scale={[.20, .09, .03]} />
    </group>)}
  </group>;
}
