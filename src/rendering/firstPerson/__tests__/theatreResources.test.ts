import * as THREE from 'three';
import { COAT_TRIANGLES, LIGHT_RECEIVER, LIGHT_SPEC, evaluateLight, opticalWorldPoint } from '../../../domain/theatre/lightGate';
import { AMES_SPEC } from '../../../domain/theatre/perspectiveExhibit';
import { createSceneResources } from '../resources';

describe('theatre authoritative geometry on the actual GPU resource path',()=>{
  it('renders the canonical opaque blocker triangles and clipped shadow in bounded reusable buffers',()=>{
    const r=createSceneResources(false,null,true,false,true),t=r.theatreResources!;
    try{
      const coat=t.coat.getAttribute('position'),expected=COAT_TRIANGLES.flatMap(tri=>tri.map(opticalWorldPoint));
      expect(coat.count).toBe(expected.length);
      expected.forEach((p,i)=>{expect(coat.getX(i)).toBeCloseTo(p.x,6);expect(coat.getY(i)).toBeCloseTo(p.y,6);expect(coat.getZ(i)).toBeCloseTo(p.z,6);});
      const attribute=t.shadowGeometry.getAttribute('position') as THREE.BufferAttribute,storage=attribute.array,uuid=t.shadowGeometry.uuid;
      expect(t.shadow.transparent).toBe(false);expect(t.shadow.depthTest).toBe(true);expect(t.shadow.depthWrite).toBe(true);
      for(const rail of [-1,-.3,0,.45,.65,1]){
        t.updateLight(rail);
        const points=evaluateLight(rail).polygons.flatMap(p=>p.slice(1,-1).flatMap((_,i)=>[p[0]!,p[i+1]!,p[i+2]!]));
        expect(t.shadowGeometry.drawRange.count).toBe(points.length);
        points.forEach((p,i)=>{
          const world=opticalWorldPoint({x:p.x,y:p.y,z:LIGHT_RECEIVER.point.z});
          expect(attribute.getX(i)).toBeCloseTo(world.x,6);expect(attribute.getY(i)).toBeCloseTo(world.y,6);expect(attribute.getZ(i)).toBeCloseTo(world.z-.012,6);
          expect(p.x).toBeGreaterThanOrEqual(LIGHT_RECEIVER.bounds.minX-1e-8);
          expect(p.x).toBeLessThanOrEqual(LIGHT_RECEIVER.bounds.maxX+1e-8);
        });
        const version=attribute.version,revision=t.lightRevision;
        for(let frame=0;frame<120;frame++)t.updateLight(rail);
        expect(attribute.version).toBe(version);expect(t.lightRevision).toBe(revision);
        expect(attribute.array).toBe(storage);expect(t.shadowGeometry.uuid).toBe(uuid);
      }
    }finally{r.dispose();}
  });
  it('quality changes keep identical same-size props, room and optical truth',()=>{
    const high=createSceneResources(false,null,true,false,true),low=createSceneResources(true,null,true,false,true);
    try{
      const h=high.theatreResources!,l=low.theatreResources!;
      for(const geometry of ['prop','room','coat'] as const)expect(l[geometry].getAttribute('position').array).toEqual(h[geometry].getAttribute('position').array);
      h.prop.computeBoundingBox();
      const size=h.prop.boundingBox!.getSize(new THREE.Vector3());
      expect(size.x).toBeCloseTo(AMES_SPEC.propWidth,6);expect(size.y).toBeCloseTo(AMES_SPEC.propHeight,6);expect(size.z).toBeCloseTo(AMES_SPEC.propDepth,6);
      expect(LIGHT_SPEC.scale).toBe(.55);
      const before=Array.from(h.room.getAttribute('position').array);
      high.updatePalette('red',true,'low');h.updateLight(.65);
      expect(Array.from(h.room.getAttribute('position').array)).toEqual(before);
    }finally{high.dispose();low.dispose();}
  });
});
