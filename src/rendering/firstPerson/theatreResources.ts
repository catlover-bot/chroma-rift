import * as THREE from 'three';
import { COAT_TRIANGLES, LIGHT_RECEIVER, LIGHT_SPEC, evaluateLight, opticalWorldPoint } from '../../domain/theatre/lightGate';
import { AMES_FACES, AMES_PROP_PARTS, AMES_REFERENCE_VERTICES, AMES_SPEC, AMES_VERTICES, amesWorldPoint, distortRoomPoint } from '../../domain/theatre/perspectiveExhibit';
import type { Vec3 } from '../../domain/firstPerson/types';

function triangles(points: readonly Vec3[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, p.y, p.z]), 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}
const quadTriangles = (p: readonly Vec3[]) => [p[0]!, p[1]!, p[2]!, p[0]!, p[2]!, p[3]!];
/** Every GPU object belongs to this scene. Shadow storage is bounded at mount;
 * only a changed physical rail value updates it, independent of React/camera. */
export function createTheatreResources() {
  const basic = (color: string) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const wall = new THREE.MeshLambertMaterial({ color: '#606770' }), floor = new THREE.MeshLambertMaterial({ color: '#535858' }),
    curtain = new THREE.MeshLambertMaterial({ color: '#624B48' }), metal = new THREE.MeshLambertMaterial({ color: '#888C88' });
  const receiver = basic('#D6CFAD'), shadow = basic('#272C2D'), amber = basic('#ECD6A1'), dark = basic('#303738'), line = new THREE.LineBasicMaterial({ color: '#A8B5AD', toneMapped: false });
  receiver.polygonOffset = true; receiver.polygonOffsetFactor = 1; receiver.polygonOffsetUnits = 1;
  const coat = triangles(COAT_TRIANGLES.flatMap(t => t.map(opticalWorldPoint)));
  const shadowGeometry = new THREE.BufferGeometry();
  const capacity = COAT_TRIANGLES.length * 5 * 9;
  shadowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity), 3).setUsage(THREE.DynamicDrawUsage));
  shadowGeometry.setDrawRange(0, 0);
  const room = triangles(AMES_FACES.filter(f => f.id !== 'front' && f.id !== 'right').flatMap(f => quadTriangles(f.indices.map(i => amesWorldPoint(AMES_VERTICES[i]!)))));
  const edges: Vec3[] = [];
  for (const [a, b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]) edges.push(amesWorldPoint(AMES_VERTICES[a!]!), amesWorldPoint(AMES_VERTICES[b!]!));
  for (const x of [-.55, 0, .55]) {
    edges.push(...[{ x, y: AMES_SPEC.floorY, z: 4 }, { x, y: AMES_SPEC.floorY, z: 6 }].map(p => amesWorldPoint(distortRoomPoint(p))));
    edges.push(...[{ x, y: AMES_SPEC.floorY, z: 6 }, { x, y: AMES_SPEC.ceilingY, z: 6 }].map(p => amesWorldPoint(distortRoomPoint(p))));
  }
  for (const z of [4.5, 5, 5.5]) edges.push(...[{ x: -1.1, y: AMES_SPEC.floorY, z }, { x: 1.1, y: AMES_SPEC.floorY, z }].map(p => amesWorldPoint(distortRoomPoint(p))));
  const roomEdges = new THREE.BufferGeometry().setFromPoints(edges.map(p => new THREE.Vector3(p.x, p.y, p.z)));
  const frameEdges = new THREE.BufferGeometry().setFromPoints(AMES_REFERENCE_VERTICES.slice(0, 4).flatMap((_, i) => [AMES_VERTICES[i]!, AMES_VERTICES[(i+1)%4]!]).map(amesWorldPoint).map(p => new THREE.Vector3(p.x, p.y, p.z)));
  const propVertices: Vec3[] = [];
  for (const { width:w, height:h, depth:d, centerY:y } of AMES_PROP_PARTS) {
    const box = new THREE.BoxGeometry(w!, h!, d!); box.translate(0,y!,0);
    const expanded = box.toNonIndexed(), a = expanded.getAttribute('position');
    for (let i=0;i<a.count;i++) propVertices.push({ x:a.getX(i),y:a.getY(i),z:a.getZ(i) });
    expanded.dispose(); box.dispose();
  }
  const prop = triangles(propVertices);
  let lastRail = NaN, revision = 0;
  const updateLight = (rail: number) => {
    if (Object.is(lastRail, rail)) return;
    const model = evaluateLight(rail), attr = shadowGeometry.getAttribute('position') as THREE.BufferAttribute;
    let count = 0;
    for (const polygon of model.polygons) for (let i=1;i+1<polygon.length;i++) {
      for (const p of [polygon[0]!,polygon[i]!,polygon[i+1]!]) {
        const q = opticalWorldPoint({ x:p.x,y:p.y,z:LIGHT_RECEIVER.point.z });
        attr.setXYZ(count++,q.x,q.y,q.z-.012);
      }
    }
    if (count * 3 > capacity) throw new RangeError('Shadow exceeded authored allocation');
    shadowGeometry.setDrawRange(0,count); attr.needsUpdate = true;
    shadowGeometry.computeBoundingSphere(); lastRail = rail; revision++;
  };
  updateLight(LIGHT_SPEC.initialRail);
  return { wall, floor, curtain, metal, receiver, shadow, amber, dark, line, coat, shadowGeometry, room, roomEdges, frameEdges, prop, updateLight,
    get lightRevision() { return revision; },
    dispose() { [wall,floor,curtain,metal,receiver,shadow,amber,dark,line,coat,shadowGeometry,room,roomEdges,frameEdges,prop].forEach(r => r.dispose()); } };
}
export type TheatreResources = ReturnType<typeof createTheatreResources>;
