/* eslint-disable react/no-unknown-property -- R3F scene intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ChapterRuntime } from '../../domain/firstPerson/types';
import type { SceneResources } from './resources';
import { exhibitFootPose, EXHIBIT_STEP_DISTANCE } from './exhibitSculpture';

/** One moving exhibit. Its convex face is explicitly separate from the static
 * concave cabinet mask; neither object is removed to substitute for the other. */
export function GalleryActor({ runtime, resources, reducedMotion }: { runtime: RefObject<ChapterRuntime>; resources: SceneResources; reducedMotion: boolean }) {
  const body = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null), rightArm = useRef<THREE.Group>(null);
  const bones = useRef<Record<string, THREE.Mesh | null>>({});
  const direction = useMemo(() => new THREE.Vector3(), []), up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const r = resources.galleryResources!;
  useFrame(() => {
    const actor = runtime.current.gallery?.actor, group = body.current;
    if (!actor || !group) return;
    group.visible = actor.visible;
    group.position.set(actor.position.x, actor.position.y, actor.position.z); group.rotation.y = actor.yaw;
    const stride = Math.sin(actor.travelledDistance * Math.PI / EXHIBIT_STEP_DISTANCE) * (reducedMotion ? .035 : .1);
    if (leftArm.current) leftArm.current.rotation.x = -stride * .65;
    if (rightArm.current) rightArm.current.rotation.x = stride * .4;
    if (head.current) { head.current.rotation.z = -.06; head.current.rotation.y = actor.phase === 'noticed' ? .12 : 0; }
    const bone = (name: string, a: number[], b: number[], radius: number) => {
      const mesh = bones.current[name]; if (!mesh) return;
      direction.set(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
      const length = direction.length();
      mesh.position.set((a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2, (a[2]! + b[2]!) / 2);
      mesh.scale.set(radius, length, radius); mesh.quaternion.setFromUnitVectors(up, direction.normalize());
    };
    for (const side of [-1, 1] as const) {
      const foot = exhibitFootPose(actor.travelledDistance, side);
      const hip = [foot.x, .87, .02], knee = [foot.x, .46 + foot.y * .5, foot.z * .45 - .045], ankle = [foot.x, .14 + foot.y, foot.z];
      bone(side + '-upper', hip, knee, .063); bone(side + '-lower', knee, ankle, .046);
      const sole = bones.current[side + '-foot'];
      if (sole) sole.position.set(foot.x, .07 + foot.y, foot.z - .008);
      const joint = bones.current[side + '-knee']; if (joint) joint.position.set(knee[0]!, knee[1]!, knee[2]!);
    }
  });
  const actor = runtime.current.gallery?.actor;
  return <group ref={body} name="gallery-exhibit-actor" visible={!!actor?.visible}
    position={actor ? [actor.position.x, actor.position.y, actor.position.z] : [0, 0, 9]} rotation={[0, actor?.yaw ?? 0, 0]} dispose={null}>
    <mesh name="actor-tailored-coat" geometry={r.actorCoat} material={r.actorCloth} />
    <mesh name="actor-back-fold" geometry={resources.box} material={r.actorDark} position={[-.035, 1.1, .212]} rotation={[0, 0, -.08]} scale={[.12, .6, .025]} />
    <mesh name="actor-raised-shoulder" geometry={r.actorBody} material={r.actorPorcelain} position={[-.24, 1.59, 0]} scale={[.15, .16, .17]} />
    <mesh name="actor-lower-shoulder" geometry={r.actorBody} material={r.actorCloth} position={[.25, 1.45, 0]} scale={[.11, .1, .15]} />
    <mesh name="actor-neck" geometry={resources.cylinder} material={r.actorDark} position={[.015, 1.73, 0]} scale={[.07, .18, .07]} />
    <group ref={head} position={[.015, 1.95, -.015]} rotation={[0, 0, -.06]}>
      <mesh name="actor-head-shell" geometry={r.actorHead} material={r.actorDark} position={[0, 0, .05]} scale={[.158, .205, .115]} />
      <mesh name="actor-convex-face" geometry={r.perceptual.convexControlGeometry} material={r.actorPorcelain} position={[0, 0, -.032]} rotation={[0, Math.PI, 0]} scale={[.36, .36, .36]} />
      <mesh name="actor-face-fastener" geometry={resources.box} material={r.actorDark} position={[.14, -.065, -.042]} rotation={[0, 0, -.15]} scale={[.022, .09, .016]} />
    </group>
    <group ref={leftArm} position={[-.31, 1.53, 0]} rotation={[0, 0, -.05]}>
      <mesh geometry={resources.cylinder} material={r.actorCloth} position={[0, -.245, 0]} scale={[.058, .49, .06]} />
      <mesh name="actor-left-elbow" geometry={r.actorBody} material={r.actorDark} position={[0, -.51, 0]} scale={[.063, .075, .06]} />
      <mesh geometry={resources.cylinder} material={r.actorPorcelain} position={[0, -.67, -.02]} scale={[.039, .29, .044]} />
      <mesh geometry={r.actorHead} material={r.actorPorcelain} position={[0, -.86, -.025]} scale={[.044, .105, .06]} />
    </group>
    <group ref={rightArm} position={[.34, 1.42, 0]} rotation={[0, 0, .015]}>
      <mesh name="actor-long-upper-arm" geometry={resources.cylinder} material={r.actorCloth} position={[0, -.3, 0]} scale={[.054, .6, .055]} />
      <mesh name="actor-right-elbow" geometry={r.actorBody} material={r.actorDark} position={[0, -.62, 0]} scale={[.057, .08, .058]} />
      <mesh name="actor-long-forearm" geometry={resources.cylinder} material={r.actorPorcelain} position={[0, -.84, -.01]} scale={[.033, .37, .042]} />
      <mesh name="actor-long-hand" geometry={r.actorHead} material={r.actorPorcelain} position={[0, -1.12, -.012]} scale={[.039, .12, .06]} />
    </group>
    {([-1, 1] as const).map(side => <group key={side} name={'actor-leg-' + side}>
      <mesh name={'actor-thigh-' + side} ref={m => { bones.current[side + '-upper'] = m; }} geometry={resources.cylinder} material={r.actorCloth} />
      <mesh name={'actor-shin-' + side} ref={m => { bones.current[side + '-lower'] = m; }} geometry={resources.cylinder} material={r.actorPorcelain} />
      <mesh name={'actor-knee-' + side} ref={m => { bones.current[side + '-knee'] = m; }} geometry={r.actorBody} material={r.actorDark} scale={[.068, .073, .067]} />
      <mesh name={'actor-planted-foot-' + side} ref={m => { bones.current[side + '-foot'] = m; }} geometry={resources.box} material={r.actorDark} scale={[.14, .14, .27]} />
    </group>)}
  </group>;
}
