import { render } from '@testing-library/react-native';
import { applyProps } from '@react-three/fiber';
import * as THREE from 'three';

import { EMBLEM_FIXTURE, EMBLEM_FIXTURE_SOLIDS } from '../../../domain/firstPerson/emblemFixture';
import { createPanelFixture, panelFixtureSolid, panelPoint } from '../../../domain/firstPerson/panelFixture';
import { getWorld } from '../../../domain/firstPerson/chapter';
import { createInitialRuntime } from '../../../domain/firstPerson/runtime';
import { ChapterScene } from '../ChapterScene';
import { PanelFixture } from '../PanelFixture';
import { createSceneResources } from '../resources';

jest.mock('@react-three/fiber/native', () => ({ useFrame: jest.fn() }));

// Real authored JSX, installed R3F prop application and Three world matrices.
// No mocked GPU result is interpreted as native visibility or perception.
describe('shared panel fixture depth and wall occlusion', () => {
  it('keeps the actual legacy chapter stimulus clear of all opaque backing/frame world boxes', async () => {
    const runtime = createInitialRuntime(), world = getWorld(runtime), resources = createSceneResources(false);
    const view = await render(<ChapterScene world={world} runtime={{ current: runtime }} progress={runtime.progress} resources={resources} assist={false} reducedMotion lowQuality={false} lab={false} />);
    try {
      const fixture = view.container.queryAll(node => node.type === 'group' && node.props.name === 'emblem-fixture')[0]!;
      const group = new THREE.Group(); applyProps(group, fixture.props);
      const meshes = fixture.queryAll(node => node.type === 'mesh').map(node => {
        const mesh = new THREE.Mesh(node.props.geometry, node.props.material); applyProps(mesh, node.props); group.add(mesh); return mesh;
      });
      group.updateMatrixWorld(true);
      const plate = meshes.find(mesh => mesh.name === 'emblem-plate')!;
      const bounds = new THREE.Box3().setFromObject(plate);
      expect(meshes).toHaveLength(6);
      expect(plate.getWorldPosition(new THREE.Vector3()).toArray()).toEqual(Object.values(EMBLEM_FIXTURE.center));
      const target = world.interactables.find(item => item.id === 'emblem-panel')!;
      expect(target.center).toBe(EMBLEM_FIXTURE.center);
      expect(target.rectangle).toMatchObject({ width: EMBLEM_FIXTURE.width, height: EMBLEM_FIXTURE.height });
      for (const mesh of meshes.filter(mesh => mesh !== plate)) {
        expect(new THREE.Box3().setFromObject(mesh).intersectsBox(bounds)).toBe(false);
        if (mesh.name.endsWith('-backing')) expect(bounds.min.z - new THREE.Box3().setFromObject(mesh).max.z).toBeCloseTo(0.02, 10);
      }
      expect(plate.material).toBe(resources.emblemSurface!.material);
      expect(plate.material).toMatchObject({ depthTest: true, depthWrite: true, transparent: false, opacity: 1 });
      expect(plate.renderOrder).toBe(0);
      const positions = meshes.map(mesh => mesh.matrixWorld.toArray());
      resources.emblemSurface!.update({ ...resources.emblemSurface!.appearance, presentation: 'neutral' });
      expect(meshes.map(mesh => mesh.matrixWorld.toArray())).toEqual(positions);
      expect(EMBLEM_FIXTURE_SOLIDS[0]).toEqual(panelFixtureSolid('emblem-panel-body', EMBLEM_FIXTURE));
      const envelope = new THREE.Box3().setFromObject(group), solid = EMBLEM_FIXTURE_SOLIDS[0]!;
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(envelope.min[axis]).toBeCloseTo(solid.min[axis], 10);
        expect(envelope.max[axis]).toBeCloseTo(solid.max[axis], 10);
      }
      // Opaque wall geometry is nearer than every visible part of the plate.
      const wall = new THREE.Mesh(resources.box, resources.wall);
      wall.position.set(EMBLEM_FIXTURE.center.x, EMBLEM_FIXTURE.center.y, -6.8); wall.scale.set(2.4, 2.4, 0.2); wall.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(1.95, 1.83, -5.8), new THREE.Vector3(0, 0, -1));
      const hits = ray.intersectObjects([wall, plate], false);
      expect(hits[0]!.object).toBe(wall);
      expect(hits.some(hit => hit.object === plate)).toBe(true);
      expect(resources.wall).toMatchObject({ depthTest: true, depthWrite: true, transparent: false });
    } finally { await view.unmount(); resources.dispose(); }
  });

  it('derives the same plane and separated geometry when mounted on a side wall', async () => {
    const fixture = createPanelFixture({ center: { x: 3, y: 1.8, z: -2 }, width: 2.4, height: 1.8, maxDistance: 4,
      normal: { x: -1, y: 0, z: 0 }, right: { x: 0, y: 0, z: 1 } });
    const resources = createSceneResources(true);
    const view = await render(<PanelFixture name="side" fixture={fixture} box={resources.box} plane={resources.plane} surface={resources.emblemSurface!.material} backing={resources.dark} frame={resources.device} />);
    try {
      const node = view.container.queryAll(item => item.type === 'group')[0]!;
      const group = new THREE.Group(); applyProps(group, node.props); group.updateMatrixWorld(true);
      const point = new THREE.Vector3(0.5, -0.25, 0).applyMatrix4(group.matrixWorld);
      const expected = panelPoint(fixture, 0.5, -0.25);
      expect(point.x).toBeCloseTo(expected.x, 10); expect(point.y).toBeCloseTo(expected.y, 10); expect(point.z).toBeCloseTo(expected.z, 10);
      const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
      expect(planeNormal.distanceTo(new THREE.Vector3(-1, 0, 0))).toBeLessThan(1e-12);
      const solid = panelFixtureSolid('side-body', fixture);
      expect(solid.min.x).toBeCloseTo(fixture.center.x - 0.02, 10);
      expect(solid.max.x).toBeCloseTo(fixture.center.x + 0.09, 10);
    } finally { await view.unmount(); resources.dispose(); }
  });
});
