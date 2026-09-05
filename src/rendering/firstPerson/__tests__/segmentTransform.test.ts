import { applyProps } from '@react-three/fiber';
import * as THREE from 'three';

import { computeSegmentTransform } from '../segmentTransform';

describe('key segment tuple geometry', () => {
  it.each([
    [{ x: 2, y: -1, z: 4 }, { x: 3, y: 5, z: -2 }],
    [{ x: 2, y: 3, z: 4 }, { x: 2, y: 1, z: 4 }],
    [{ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }],
  ])('keeps cylinder endpoints and width for %o → %o', (from, to) => {
    const transform = computeSegmentTransform(from, to, 0.017);
    const object = new THREE.Object3D();
    applyProps(object, { ...transform, args: [] });
    object.updateMatrix();
    const actualFrom = new THREE.Vector3(0, -0.5, 0).applyMatrix4(object.matrix);
    const actualTo = new THREE.Vector3(0, 0.5, 0).applyMatrix4(object.matrix);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(actualFrom[axis]).toBeCloseTo(from[axis], 10);
      expect(actualTo[axis]).toBeCloseTo(to[axis], 10);
      expect(object.position[axis]).toBe((from[axis] + to[axis]) / 2);
    }
    expect(object.quaternion.length()).toBeCloseTo(1, 12);
    expect(object.quaternion.toArray()).toEqual(transform.quaternion);
    expect(object.scale.x).toBe(0.017);
    expect(object.scale.z).toBe(0.017);
    expect(object.scale.y).toBeCloseTo(new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z).length(), 12);
  });

  it.each([NaN, Infinity, -Infinity])('rejects a non-finite endpoint (%s) explicitly', (invalid) => {
    expect(() => computeSegmentTransform({ x: invalid, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, 0.01)).toThrow('endpoints must contain finite coordinates');
  });

  it.each([0, -0.01, NaN, Infinity])('rejects an invalid width (%s) explicitly', (width) => {
    expect(() => computeSegmentTransform({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, width)).toThrow('width must be finite and greater than zero');
  });

  it('rejects coincident endpoints instead of silently adding a segment at the origin', () => {
    expect(() => computeSegmentTransform({ x: 3, y: 2, z: 1 }, { x: 3, y: 2, z: 1 }, 0.01)).toThrow('length must be finite and greater than zero');
  });

  it('rejects overflowing calculations even when the endpoint components are finite', () => {
    expect(() => computeSegmentTransform({ x: -Number.MAX_VALUE, y: 0, z: 0 }, { x: Number.MAX_VALUE, y: 1, z: 0 }, 0.01)).toThrow('length must be finite and greater than zero');
    expect(() => computeSegmentTransform({ x: Number.MAX_VALUE, y: 0, z: 0 }, { x: Number.MAX_VALUE, y: 1, z: 0 }, 0.01)).toThrow('transform must contain finite values');
  });
});
