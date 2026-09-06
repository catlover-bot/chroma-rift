import * as THREE from 'three';
import { createExhibitCoatGeometry, exhibitFootPose } from '../exhibitSculpture';

it('keeps one foot on the floor throughout three full strides without sinking either sole', () => {
  for (let distance = 0; distance < 2.88; distance += .006) {
    const feet = [exhibitFootPose(distance, -1), exhibitFootPose(distance, 1)];
    expect(feet.some(foot => foot.stance && foot.y === 0)).toBe(true);
    for (const foot of feet) { expect(foot.y).toBeGreaterThanOrEqual(0); expect(foot.y).toBeLessThanOrEqual(.055); expect(Math.abs(foot.z)).toBeLessThanOrEqual(.24 + 1e-9); }
  }
});
it.each([0, Math.PI / 2, -Math.PI / 2])('plants a foot while the domain moves forward (-sin yaw, -cos yaw), yaw=%s', yaw => {
  const matrix = new THREE.Matrix4().makeRotationY(yaw);
  const first = exhibitFootPose(0, -1);
  const start = new THREE.Vector3(first.x, first.y, first.z).applyMatrix4(matrix);
  for (const distance of [0, .08, .16, .24, .32, .4]) {
    const foot = exhibitFootPose(distance, -1);
    const world = new THREE.Vector3(foot.x, foot.y, foot.z).applyMatrix4(matrix).add(new THREE.Vector3(-Math.sin(yaw) * distance, 0, -Math.cos(yaw) * distance));
    expect(foot.stance).toBe(true); expect(world.distanceTo(start)).toBeLessThan(1e-12);
  }
});
it('builds a closed asymmetric coat within authored body clearance with outward side normals', () => {
  const g = createExhibitCoatGeometry();
  try {
    expect(g.boundingBox!.min.y).toBeGreaterThan(.6); expect(g.boundingBox!.max.y).toBeLessThan(1.71);
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 8; i < 24; i++) {
      expect(p.getX(i) * n.getX(i) + (p.getZ(i) - .03) * n.getZ(i)).toBeGreaterThan(0);
      expect(Math.hypot(p.getX(i), p.getZ(i))).toBeLessThan(.36);
    }
  } finally { g.dispose(); }
});
