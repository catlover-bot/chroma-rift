/* eslint-disable react/no-unknown-property -- R3F Three intrinsics. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { WorldGeometry } from '../../domain/firstPerson/types';
import type { SceneResources } from './resources';
import { FACILITY_SIGN_HEIGHT, FACILITY_SIGN_WIDTH, type FacilitySignId } from './facilitySignData';

type Block = { position: [number, number, number]; scale: [number, number, number] };
/** One instance buffer per material, shared box and scene-owned materials.
 * Surface relief stays <=6mm. Neither a doorway nor an illusion is covered. */
function DetailBatch({ blocks, material, resources, name }: { blocks: Block[]; material: THREE.Material; resources: SceneResources; name: string }) {
  const object = useMemo(() => {
    const mesh = new THREE.InstancedMesh(resources.box, material, blocks.length), transform = new THREE.Object3D();
    mesh.name = name;
    blocks.forEach((block, i) => { transform.position.fromArray(block.position); transform.scale.fromArray(block.scale);
      transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    return mesh;
  }, [blocks, material, name, resources.box]);
  useEffect(() => () => object.dispose(), [object]);
  return <primitive object={object} dispose={null}/>;
}

export function FacilityDetails({ world, resources }: { world: WorldGeometry<string>; resources: SceneResources }) {
  const blocks = useMemo(() => {
    const trim: Block[] = [], seam: Block[] = [], timber: Block[] = [], contact: Block[] = [];
    for (const solid of world.solids) {
      if (solid.opaque === false || solid.kind !== 'wall' || /actor|mask|ames|projection|stimulus|optical/i.test(solid.id)) continue;
      const width = solid.max.x - solid.min.x, depth = solid.max.z - solid.min.z, height = solid.max.y - solid.min.y;
      if (height < .5 || solid.min.y > .2) continue;
      const x = (solid.min.x + solid.max.x) / 2, z = (solid.min.z + solid.max.z) / 2;
      trim.push({ position: [x, .085, z], scale: [width + (width < depth ? .012 : 0), .17, depth + (depth <= width ? .012 : 0)] });
      // The narrow strips belong to the wall face and follow existing openings.
      if (height > 2.7) trim.push({ position: [x, 2.72, z], scale: [width + .009, .055, depth + .009] });
      if (/shelf|rack/i.test(solid.id)) {
        for (const y of [.35, 1.03, 1.71, 2.39].filter(y => y < height - .1))
          timber.push({ position: [x, y, z], scale: [width + .01, .07, depth + .01] });
        contact.push({ position: [x, .006, z], scale: [width + .1, .008, depth + .1] });
      } else {
        const length = Math.max(width, depth);
        for (let offset = 1.2; offset < length - .2; offset += 1.2) seam.push({
          position: [width > depth ? solid.min.x + offset : x, height / 2, depth >= width ? solid.min.z + offset : z],
          scale: [width > depth ? .008 : width + .007, height - .2, depth >= width ? .008 : depth + .007],
        });
      }
    }
    return { trim, seam, timber, contact };
  }, [world]);
  return <group name="facility-construction-details" dispose={null}>
    <DetailBatch name="wall-skirting-and-rails" blocks={blocks.trim} material={resources.art.enamel} resources={resources}/>
    <DetailBatch name="wall-panel-joints" blocks={blocks.seam} material={resources.art.rubber} resources={resources}/>
    <DetailBatch name="timber-shelf-edges" blocks={blocks.timber} material={resources.art.timber} resources={resources}/>
    <DetailBatch name="furniture-contact-shading" blocks={blocks.contact} material={resources.art.contact} resources={resources}/>
  </group>;
}

/** Every tile is 0.6m in both axes regardless of a floor's dimensions. The
 * authored UVs are geometry data, avoiding per-mesh texture/material copies. */
export function FacilityFloor({ x, z, width, depth, resources, outdoor = false }: {
  x: number; z: number; width: number; depth: number; resources: SceneResources; outdoor?: boolean }) {
  const geometry = useMemo(() => {
    const result = new THREE.PlaneGeometry(width, depth), uv = result.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / .6, uv.getY(i) * depth / .6);
    return result;
  }, [width, depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name={outdoor ? 'courtyard-paving-finish' : 'terrazzo-floor-finish'} geometry={geometry}
    material={resources.art.floor} position={[x, -.001, z]} rotation={[-Math.PI / 2, 0, 0]}/>;
}

/** Scene-owned texture/material and shared geometry; a plaque never adds a
 * collider or changes an optical stimulus. Keep the authored mask aspect. */
export function FacilityPlaque({ id, resources, position, yaw = 0, width = 1.6 }: {
  id: FacilitySignId; resources: SceneResources; position: [number, number, number]; yaw?: number; width?: number;
}) {
  const height = width * FACILITY_SIGN_HEIGHT / FACILITY_SIGN_WIDTH;
  return <group name={`${id}-facility-plaque`} position={position} rotation={[0, yaw, 0]} dispose={null}>
    <mesh name={`${id}-facility-backing`} geometry={resources.box} material={resources.art.metal} scale={[width + .045, height + .045, .018]}/>
    <mesh name={`${id}-facility-label`} geometry={resources.plane} material={resources.facilitySign(id)} position={[0, 0, .012]} scale={[width, height, 1]}/>
  </group>;
}
