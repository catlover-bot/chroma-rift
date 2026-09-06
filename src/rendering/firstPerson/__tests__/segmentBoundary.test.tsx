import { render } from '@testing-library/react-native';
import { applyProps } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

import { getWorld } from '../../../domain/firstPerson/chapter';
import { createInitialRuntime } from '../../../domain/firstPerson/runtime';
import type { ChapterRuntime } from '../../../domain/firstPerson/types';
import { ChapterScene } from '../ChapterScene';
import { createSceneResources } from '../resources';

// Only the frame hook is isolated from a mounted GPU Canvas. The actual scene
// JSX, Three objects and installed R3F applyProps implementation remain real.
jest.mock('@react-three/fiber/native', () => ({ useFrame: jest.fn() }));

describe('authored key segment JSX and installed R3F prop boundary', () => {
  it('uses finite numeric tuples for every outline and fragment and keeps transforms in place', async () => {
    const runtime = createInitialRuntime();
    const world = getWorld(runtime);
    const resources = createSceneResources(false);
    const view = await render(<ChapterScene world={world} runtime={{ current: runtime }} progress={runtime.progress} resources={resources} assist={false} reducedMotion lowQuality={false} lab={false} />);
    try {
      const meshes = view.container.queryAll((node) => node.type === 'mesh' && node.props.name === 'key-segment');
      const lines = [...world.keyFrame.outline, ...world.keyFragments.map((fragment) => fragment.points)];
      const endpoints = lines.flatMap((line) => line.slice(1).map((to, index) => ({ from: line[index]!, to })));
      expect(meshes).toHaveLength(endpoints.length);
      expect(meshes.some((node) => node.props.material === resources.quiet)).toBe(true);
      expect(meshes.some((node) => node.props.material === resources.key)).toBe(true);
      const target = new THREE.Mesh(resources.cylinder, resources.key);
      const identities = { position: target.position, rotation: target.rotation, quaternion: target.quaternion, scale: target.scale };
      meshes.forEach((mesh, index) => {
        const props = mesh.props;
        expect(props.geometry).toBe(resources.cylinder);
        expect(Array.isArray(props.position)).toBe(true);
        expect(Array.isArray(props.quaternion)).toBe(true);
        expect(Array.isArray(props.scale)).toBe(true);
        expect(props.position).toHaveLength(3);
        expect(props.quaternion).toHaveLength(4);
        expect([...props.position, ...props.quaternion, ...props.scale].every(Number.isFinite)).toBe(true);
        expect(() => applyProps(target, props)).not.toThrow();
        expect(target.position).toBe(identities.position);
        expect(target.rotation).toBe(identities.rotation);
        expect(target.quaternion).toBe(identities.quaternion);
        expect(target.scale).toBe(identities.scale);
        target.updateMatrix();
        const from = new THREE.Vector3(0, -0.5, 0).applyMatrix4(target.matrix);
        const to = new THREE.Vector3(0, 0.5, 0).applyMatrix4(target.matrix);
        const expected = endpoints[index]!;
        expect(from.x).toBeCloseTo(expected.from.x, 10);
        expect(from.y).toBeCloseTo(expected.from.y, 10);
        expect(from.z).toBeCloseTo(expected.from.z, 10);
        expect(to.x).toBeCloseTo(expected.to.x, 10);
        expect(to.y).toBeCloseTo(expected.to.y, 10);
        expect(to.z).toBeCloseTo(expected.to.z, 10);
      });
      const stableTuples = meshes.map((mesh) => ({ position: mesh.props.position, quaternion: mesh.props.quaternion, scale: mesh.props.scale }));
      await view.rerender(<ChapterScene world={world} runtime={{ current: runtime }} progress={runtime.progress} resources={resources} assist reducedMotion lowQuality={false} lab={false} />);
      const updatedMeshes = view.container.queryAll((node) => node.type === 'mesh' && node.props.name === 'key-segment');
      updatedMeshes.forEach((mesh, index) => {
        expect(mesh.props.position).toBe(stableTuples[index]!.position);
        expect(mesh.props.quaternion).toBe(stableTuples[index]!.quaternion);
        expect(mesh.props.scale).toBe(stableTuples[index]!.scale);
      });
    } finally {
      await view.unmount();
      resources.dispose();
    }
  });

  it.each([true, false])('forwards the original scene-frame exception when a handler is supplied: %s', async (withHandler) => {
    const runtime = createInitialRuntime();
    const resources = createSceneResources(false);
    const failure = new Error('scene-frame regression fixture');
    const failingRuntime = { get current(): ChapterRuntime { throw failure; } };
    const onFrameError = jest.fn();
    const view = await render(<ChapterScene world={getWorld(runtime)} runtime={failingRuntime} progress={runtime.progress} resources={resources} assist={false} reducedMotion lowQuality={false} lab={false} {...(withHandler ? { onFrameError } : {})} />);
    try {
      const callback = jest.mocked(useFrame).mock.calls.at(-1)![0];
      const invoke = () => callback({} as Parameters<typeof callback>[0], 1 / 60);
      if (withHandler) {
        expect(invoke).not.toThrow();
        expect(onFrameError).toHaveBeenCalledTimes(1);
        expect(onFrameError).toHaveBeenCalledWith(failure);
      } else {
        expect(invoke).toThrow(failure);
        expect(onFrameError).not.toHaveBeenCalled();
      }
    } finally {
      await view.unmount();
      resources.dispose();
    }
  });
});
