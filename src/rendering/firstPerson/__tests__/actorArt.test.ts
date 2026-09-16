import * as THREE from 'three';
import { actorMotionEye, advanceActorMotion, createActorMotion, type ActorGait } from '../../../domain/actorMotion';
import { ACTOR_COLLISION_RADIUS, ACTOR_MODEL_BOUNDS } from '../../../domain/actorMotion/envelope';
import { createActorArtResources } from '../actorArtResources';
import { actorShutdownPose, createActorArtRig } from '../actorArtRig';
import { createSceneResources } from '../resources';

const triangles = (root: THREE.Object3D) => { let count=0;root.traverse(o=>{if(o instanceof THREE.Mesh)count+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;});return count; };
function scan(root:THREE.Group, origin:THREE.Vector3){const p=new THREE.Vector3();let minY=Infinity,maxY=-Infinity,halfWidth=0,halfDepth=0;
  root.updateMatrixWorld(true);root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const attr=o.geometry.getAttribute('position');for(let i=0;i<attr.count;i++){
    p.fromBufferAttribute(attr,i).applyMatrix4(o.matrixWorld).sub(origin);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);halfWidth=Math.max(halfWidth,Math.abs(p.x));halfDepth=Math.max(halfDepth,Math.abs(p.z));
  }});return {minY,maxY,halfWidth,halfDepth};}

describe('the shared authored patrol body and explicit rig',()=>{
  it.each([false,true])('owns a shaped UV body with useful detail budgets and a continuous neck/coat at quality low=%s',low=>{
    const resources=createSceneResources(low,null,true), art=resources.galleryResources!.actorArt, rig=createActorArtRig(art);
    try {rig.apply({motion:createActorMotion({x:0,y:0,z:0}),visible:true});
      expect(art.low).toBe(low);expect(triangles(rig.root)).toBeGreaterThanOrEqual(low?4000:12000);expect(triangles(rig.root)).toBeLessThanOrEqual(low?8000:24000);
      for(const g of Object.values(art.geometries))for(const name of ['position','normal','uv','color'])expect([...g.getAttribute(name).array].every(Number.isFinite)).toBe(true);
      const coat=art.geometries.coat.boundingBox!;expect(coat.max.y+1.23).toBeGreaterThan(1.79);expect(coat.min.y+1.23).toBeLessThan(.64);
      expect(art.materials.cast.roughness).toBeGreaterThan(.8);expect(art.materials.cast.emissive.getHex()).toBe(0);
      expect(art.materials.cloth.map).toBeNull();expect(art.materials.cloth.vertexColors).toBe(true);
      expect(art.geometries.leftHand).not.toBe(art.geometries.rightHand);
      expect(rig.root.getObjectsByProperty('type','Mesh').length).toBeLessThan(25);
    }finally{resources.dispose();}
  });
  it('keeps the licensed illusion face geometry and material unchanged when making cast paint',()=>{
    const resources=createSceneResources(false,null,true),r=resources.galleryResources!, source=r.perceptual.convexControlGeometry;
    const positions=[...source.getAttribute('position').array],normals=[...source.getAttribute('normal').array],colors=source.getAttribute('color');
    const art=createActorArtResources(true,source);
    expect(art.geometries.face).not.toBe(source);expect([...source.getAttribute('position').array]).toEqual(positions);
    expect([...source.getAttribute('normal').array]).toEqual(normals);expect(source.getAttribute('color')).toBe(colors);
    expect(art.geometries.face.getAttribute('color').count).toBe(source.getAttribute('position').count);art.dispose();resources.dispose();
  });
  it.each([false,true])('grounds the actual shoes and preserves active eye/root truth across representative poses low=%s',low=>{
    const resources=createSceneResources(low,null,true),rig=createActorArtRig(resources.galleryResources!.actorArt);
    try{let motion=createActorMotion({x:0,y:0,z:0});
      for(const gait of ['idle','patrol','notice','search','pursue','windup','attack','recover'] as ActorGait[]){
        for(let frame=0;frame<90;frame++){
          motion=advanceActorMotion(motion,{gait,maxSpeed:gait==='pursue'?2.35:gait==='patrol'?.84:0,...(['patrol','pursue'].includes(gait)?{target:{x:0,y:0,z:-20}}:{}),desiredHeading:0,lookTarget:{x:.3,y:1.6,z:motion.position.z-3}},1/60,()=>true).state;
          const before=JSON.stringify(motion);rig.apply({motion,visible:true});rig.root.updateMatrixWorld(true);
          expect(JSON.stringify(motion)).toBe(before);expect(rig.root.position.toArray()).toEqual([motion.position.x,motion.position.y,motion.position.z]);
          const eye=actorMotionEye(motion),direction=new THREE.Vector3(0,0,-1).applyQuaternion(rig.head.getWorldQuaternion(new THREE.Quaternion()));
          expect(direction.distanceTo(new THREE.Vector3(eye.direction.x,eye.direction.y,eye.direction.z))).toBeLessThan(1e-10);
          const center=rig.head.getWorldPosition(new THREE.Vector3()).addScaledVector(direction,.085);
          expect(center.distanceTo(new THREE.Vector3(eye.position.x,eye.position.y,eye.position.z))).toBeLessThan(1e-10);
          for(const [index,leg]of rig.legs.entries()){
            const sole=leg.sole.getWorldPosition(new THREE.Vector3()),foot=motion.feet[index]!;
            expect(sole.distanceTo(new THREE.Vector3(foot.position.x,motion.position.y+foot.position.y,foot.position.z))).toBeLessThan(1e-10);
            if(foot.stance){const bottom=new THREE.Box3().setFromObject(leg.sole).min.y;expect(bottom).toBeCloseTo(0,8);}
            const p=new THREE.Vector3(),v=leg.sole.geometry.getAttribute('position');let radius=0;for(let i=0;i<v.count;i++){p.fromBufferAttribute(v,i).applyMatrix4(leg.sole.matrixWorld);radius=Math.max(radius,Math.hypot(p.x-motion.position.x,p.z-motion.position.z));}expect(radius).toBeLessThan(ACTOR_COLLISION_RADIUS);
          }
          if(frame%15===0){const bounds=scan(rig.root,new THREE.Vector3(motion.position.x,motion.position.y,motion.position.z));
            expect(bounds.minY).toBeGreaterThanOrEqual(-1e-7);expect(bounds.maxY).toBeLessThanOrEqual(ACTOR_MODEL_BOUNDS.height);
            expect(bounds.halfWidth).toBeLessThanOrEqual(ACTOR_MODEL_BOUNDS.halfWidth);expect(bounds.halfDepth).toBeLessThanOrEqual(ACTOR_MODEL_BOUNDS.halfDepth);}
        }
      }
    }finally{resources.dispose();}
  });
  it('relaxes hands, then shoulders, then head, without moving feet or reactivating at cold settled time',()=>{
    expect(actorShutdownPose(.2)).toMatchObject({shoulders:0,head:0});expect(actorShutdownPose(.2).hands).toBeGreaterThan(0);
    expect(actorShutdownPose(.7)).toMatchObject({hands:1,head:0});expect(actorShutdownPose(.7).shoulders).toBeGreaterThan(0);
    expect(actorShutdownPose(1.6)).toEqual({hands:1,shoulders:1,head:1});expect(actorShutdownPose()).toEqual({hands:0,shoulders:0,head:0});
    const resources=createSceneResources(false,null,true),rig=createActorArtRig(resources.galleryResources!.actorArt),motion=createActorMotion({x:1,y:0,z:2});
    try{const snapshots:number[][]=[];for(const seconds of [0,.2,.7,1.2,1.6,5,30]){rig.apply({motion,visible:true,shutdownSeconds:seconds});rig.root.updateMatrixWorld(true);
      expect(rig.root.position.toArray()).toEqual([1,0,2]);expect(rig.legs.map(l=>l.sole.getWorldPosition(new THREE.Vector3()).y)).toEqual([0,0]);
      snapshots.push([...rig.head.quaternion.toArray(),...rig.chest.quaternion.toArray(),...rig.arms.flatMap(a=>a.wrist.quaternion.toArray())]);}
      expect(snapshots[4]).toEqual(snapshots[5]);expect(snapshots[5]).toEqual(snapshots[6]);expect(snapshots[0]).not.toEqual(snapshots[4]);
    }finally{resources.dispose();}
  });
  it('releases all geometry and materials exactly once over ten actual scene resource owners',()=>{
    for(let i=0;i<10;i++){const resources=createSceneResources(i%2===0,null,true),art=resources.galleryResources!.actorArt,owned=[...Object.values(art.geometries),...Object.values(art.materials)],calls=new Map<object,number>();
      for(const item of owned)item.addEventListener('dispose',()=>calls.set(item,(calls.get(item)??0)+1));resources.dispose();resources.galleryResources!.dispose();
      expect(calls.size).toBe(owned.length);expect([...calls.values()].every(n=>n===1)).toBe(true);
    }
  });
});
