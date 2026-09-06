/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import { useMemo } from 'react';
import * as THREE from 'three';

import type { PanelFixtureDefinition } from '../../domain/firstPerson/panelFixture';

/** All meshes use one surface basis. The material is provided by its existing
 * scene owner; this component creates no geometry, material, or renderer. */
export function PanelFixture({ fixture, box, plane, surface, backing, frame, name }: {
  fixture: PanelFixtureDefinition; box: THREE.BufferGeometry; plane: THREE.BufferGeometry;
  surface: THREE.Material; backing: THREE.Material; frame: THREE.Material; name: string;
}) {
  const rotation = useMemo(() => {
    const vector = (v: { x: number; y: number; z: number }) => new THREE.Vector3(v.x, v.y, v.z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(vector(fixture.right), vector(fixture.up), vector(fixture.normal)));
  }, [fixture]);
  return <group name={name + '-fixture'} position={[fixture.center.x, fixture.center.y, fixture.center.z]} quaternion={rotation}>
    <mesh name={name + '-backing'} geometry={box} material={backing} position={fixture.backing.position} scale={fixture.backing.scale} />
    <mesh name={name + '-plate'} geometry={plane} material={surface} scale={[fixture.width, fixture.height, 1]} castShadow={false} receiveShadow={false} />
    {fixture.frames.map(part => <mesh key={part.name} name={name + '-frame-' + part.name} geometry={box} material={frame} position={part.position} scale={part.scale} />)}
  </group>;
}
