import * as THREE from 'three';
import { actorLegKnee, sampleActorPose, type ActorMotionState } from '../../domain/actorMotion';
import type { ActorArtResources } from './actorArtResources';

export type ActorArtSource = { motion: ActorMotionState; visible: boolean; shutdownSeconds?: number };
const settle = (seconds: number, start: number, duration: number) => {
  const t = Math.max(0, Math.min(1, (seconds - start) / duration)); return t * t * (3 - 2 * t);
};
/** Transient, externally committed stop time. No local clock or AI state. */
export function actorShutdownPose(seconds?: number) {
  const time = seconds !== undefined && Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return { hands: settle(time, 0, .45), shoulders: settle(time, .4, .65), head: settle(time, .95, .65) };
}
/** A single explicit rig. Shared scene resources own all GPU allocations;
 * this mount owns transforms only. Mirror passes read the same posed objects. */
export function createActorArtRig(art: ActorArtResources, name = 'gallery-exhibit-actor') {
  const root = new THREE.Group(); root.name = name;
  const group = (name: string, parent: THREE.Group, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group(); g.name = name; g.position.set(x,y,z); parent.add(g); return g;
  };
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Group) => {
    const m = new THREE.Mesh(geometry,material); m.name=name; parent.add(m); return m;
  };
  const g = art.geometries, m = art.materials;
  const chest = group('actor-delayed-chest',root,0,1.23);
  const coat = mesh('actor-tailored-coat',g.coat,m.cloth,chest);
  mesh('actor-repaired-lapels',g.lapels,m.facing,chest);
  mesh('actor-guide-fittings',g.hardware,m.hardware,chest);
  const arms = ([-1,1] as const).map(side => {
    const shoulder = group(side < 0 ? 'actor-left-shoulder-pivot' : 'actor-right-shoulder-pivot',chest,side * .258,side < 0 ? .345 : .301,.007);
    shoulder.rotation.z=side*.045;
    mesh('actor-upper-sleeve-'+side,g.upperSleeve,m.cloth,shoulder);
    const elbow=group(side < 0 ? 'actor-left-elbow-pivot' : 'actor-right-elbow-pivot',shoulder,0,-.383,0);
    mesh('actor-cuffed-sleeve-'+side,g.foreSleeve,side<0?m.cloth:m.facing,elbow);
    const wrist=group('actor-wrist-'+side,elbow,0,-.331,-.003);
    mesh('actor-articulated-hand-'+side,side<0?g.leftHand:g.rightHand,m.cast,wrist);
    return {side,shoulder,elbow,wrist};
  });
  const head=group('actor-leading-head',root);
  mesh('actor-head-shell',g.shell,m.leather,head);
  const face=mesh('actor-convex-face',g.face,m.cast,head);face.position.z=-.032;face.rotation.y=Math.PI;face.scale.setScalar(.36);
  mesh('actor-face-fasteners',g.maskFasteners,m.hardware,head);
  const legs=([-1,1] as const).map(side=>({side,
    thigh:mesh('actor-thigh-'+side,g.thigh,m.trousers,root),shin:mesh('actor-shin-'+side,g.shin,m.trousers,root),
    sole:mesh('actor-planted-foot-'+side,g.shoe,m.leather,root),contact:mesh('actor-foot-contact-'+side,g.contact,m.contact,root)}));
  const direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  const bone=(mesh:THREE.Mesh,a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>{
    direction.set(b.x-a.x,b.y-a.y,b.z-a.z);const length=direction.length();
    mesh.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);mesh.scale.set(1,length + .07,1);
    // Geometry's +Y is the hip end, so it follows ankle -> hip.
    mesh.quaternion.setFromUnitVectors(up,direction.multiplyScalar(-1).normalize());
  };
  return {root,head,chest,arms,legs,apply(source:ActorArtSource | undefined){
    if (!source) { root.visible = false; return; }
    const {motion}=source,pose=sampleActorPose(motion),stop=actorShutdownPose(source.shutdownSeconds);
    root.visible=source.visible;root.position.set(motion.position.x,motion.position.y,motion.position.z);root.rotation.y=motion.yaw;
    chest.position.set(pose.pelvisShift,1.23-.023*stop.shoulders,0);
    chest.rotation.set(pose.chestLean*(1-stop.shoulders),pose.chestYaw*(1-stop.shoulders),0,'YXZ');
    coat.rotation.z=pose.pelvisShift*.4*(1-stop.shoulders);
    head.position.set(pose.headPosition.x,pose.headPosition.y-.022*stop.head,pose.headPosition.z);
    head.rotation.set(pose.headPitch*(1-stop.head)-.18*stop.head,pose.headYaw*(1-stop.head),pose.headRoll-.015*stop.head,'YXZ');
    const attack=motion.gait==='windup'?.045:motion.gait==='attack'?-.16:motion.gait==='recover'?-.16*(1-settle(motion.gaitTime,0,.55)):0;
    for(const arm of arms){const left=arm.side<0;
      arm.shoulder.rotation.x=((left?pose.leftArm:pose.rightArm)+attack)*(1-stop.shoulders);
      arm.shoulder.rotation.z=arm.side*(.045-.021*stop.shoulders);
      arm.elbow.rotation.x=(left?pose.leftElbow:pose.rightElbow)*(1-stop.hands);
      arm.wrist.rotation.x=-.11+.25*stop.hands;
      arm.wrist.rotation.z=arm.side*.035*(1-stop.hands);
    }
    for(const leg of legs){const foot=leg.side<0?pose.leftFoot:pose.rightFoot;
      const hip={x:leg.side*.105+pose.pelvisShift,y:.87,z:.02},ankle={x:foot.position.x,y:.14+foot.position.y,z:foot.position.z};
      const knee=actorLegKnee(hip,ankle);bone(leg.thigh,hip,knee);bone(leg.shin,knee,ankle);
      leg.sole.position.set(foot.position.x,foot.position.y,foot.position.z);leg.sole.rotation.y=foot.yaw;
      leg.contact.position.set(foot.position.x,0,foot.position.z);leg.contact.rotation.y=foot.yaw;leg.contact.visible=foot.stance;
    }
  }};
}
export type ActorArtRig = ReturnType<typeof createActorArtRig>;
