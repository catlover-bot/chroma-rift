import * as THREE from 'three';
import mask from '../../../../assets/perceptual/hollow-mask.json';
import { configureNotebookCamera } from '../notebookCamera';

it.each([[320, 568], [390, 763], [430, 839]])('fits every actual face vertex inside the measured window across the orbit at %s × %s', (width, height) => {
  const camera = new THREE.PerspectiveCamera(), vertex = new THREE.Vector3();
  for (const window of [{ x: 0, y: .16, width: 1, height: .44 }, { x: .02, y: .3, width: .96, height: .25 }]) {
    for (let step = 0; step <= 20; step++) {
      configureNotebookCamera(camera, width, height, { kind: 'mask', yaw: -Math.PI / 2 + step * Math.PI / 20, window });
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < mask.positions.length; i += 3) {
        vertex.fromArray(mask.positions, i).project(camera);
        const x = (vertex.x + 1) / 2, y = (1 - vertex.y) / 2;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, vertex.z); maxZ = Math.max(maxZ, vertex.z);
      }
      // Extrema quantify the same strict bounds over every vertex, without hundreds of thousands of matcher allocations.
      expect(minX).toBeGreaterThan(window.x); expect(maxX).toBeLessThan(window.x + window.width);
      expect(minY).toBeGreaterThan(window.y); expect(maxY).toBeLessThan(window.y + window.height);
      expect(minZ).toBeGreaterThan(-1); expect(maxZ).toBeLessThan(1);
    }
  }
});
