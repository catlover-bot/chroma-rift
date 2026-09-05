import * as THREE from 'three';

import type { Vec3 } from '../../domain/firstPerson/types';

export interface SegmentTransform {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

/** A unit cylinder runs along local Y; its ends must remain at from and to. */
export function computeSegmentTransform(from: Vec3, to: Vec3, width: number): SegmentTransform {
  if (![from.x, from.y, from.z, to.x, to.y, to.z].every(Number.isFinite)) {
    throw new RangeError('Key segment endpoints must contain finite coordinates.');
  }
  if (!Number.isFinite(width) || width <= 0) {
    throw new RangeError('Key segment width must be finite and greater than zero.');
  }
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const end = new THREE.Vector3(to.x, to.y, to.z);
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (!Number.isFinite(length) || length <= 0) {
    throw new RangeError('Key segment length must be finite and greater than zero.');
  }
  const center = start.add(end).multiplyScalar(0.5);
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  // JSX receives data, never constructor-sensitive Three transform objects.
  // Quaternion tuples use Three/R3F's x, y, z, w order.
  const transform: SegmentTransform = {
    position: [center.x, center.y, center.z],
    quaternion: [orientation.x, orientation.y, orientation.z, orientation.w],
    scale: [width, length, width],
  };
  if (![...transform.position, ...transform.quaternion, ...transform.scale].every(Number.isFinite)) {
    throw new RangeError('Key segment transform must contain finite values.');
  }
  return transform;
}
