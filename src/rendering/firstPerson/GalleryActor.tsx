/* eslint-disable react/no-unknown-property -- R3F scene intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ChapterRuntime } from '../../domain/firstPerson/types';
import type { SceneResources } from './resources';

/** Original hierarchical low-poly sculpture; no skeleton, borrowed asset, or
 * camera-facing scare plane. All limb poses stay inside the domain sight volume. */
export function GalleryActor({ runtime, resources, reducedMotion }: { runtime: RefObject<ChapterRuntime>; resources: SceneResources; reducedMotion: boolean }) {
  const body = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null), rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null), rightLeg = useRef<THREE.Group>(null);
  const r = resources.galleryResources!;
  useFrame(() => {
    const actor = runtime.current.gallery?.actor, group = body.current;
    if (!actor || !group) return;
    group.visible = actor.visible;
    group.position.set(actor.position.x, actor.position.y, actor.position.z);
    group.rotation.y = actor.yaw;
    const stride = Math.sin(actor.travelledDistance * 6) * (reducedMotion ? .05 : .18);
    if (leftLeg.current) leftLeg.current.rotation.x = stride;
    if (rightLeg.current) rightLeg.current.rotation.x = -stride;
    if (leftArm.current) leftArm.current.rotation.x = -stride * .65;
    if (rightArm.current) rightArm.current.rotation.x = stride * .4;
    if (head.current) head.current.rotation.z = -.08;
  });
  const actor = runtime.current.gallery?.actor;
  return <group ref={body} name="gallery-exhibit-actor" visible={!!actor?.visible}
    position={actor ? [actor.position.x, actor.position.y, actor.position.z] : [0, 0, 9]} rotation={[0, actor?.yaw ?? 0, 0]} dispose={null}>
    <mesh name="actor-torso" geometry={r.actorBody} material={r.actorCloth} position={[0, 1.2, 0]} scale={[.29, .44, .19]} />
    <mesh name="actor-hips" geometry={resources.box} material={r.actorCloth} position={[0, .82, 0]} scale={[.32, .2, .26]} />
    <mesh name="actor-raised-shoulder" geometry={r.actorBody} material={r.actorPorcelain} position={[-.24, 1.59, 0]} scale={[.15, .16, .17]} />
    <mesh name="actor-lower-shoulder" geometry={r.actorBody} material={r.actorCloth} position={[.25, 1.45, 0]} scale={[.11, .1, .15]} />
    <mesh geometry={resources.cylinder} material={r.actorPorcelain} position={[.015, 1.7, 0]} scale={[.075, .16, .075]} />
    <group ref={head} position={[.025, 1.92, -.02]} rotation={[0, 0, -.08]}>
      <mesh name="actor-smooth-face" geometry={r.actorHead} material={r.actorPorcelain} scale={[.16, .23, .145]} />
      <mesh name="actor-face-seam" geometry={resources.box} material={r.actorCloth} position={[.11, -.1, .096]} rotation={[0, 0, -.22]} scale={[.008, .13, .015]} />
    </group>
    <group ref={leftArm} position={[-.31, 1.53, 0]} rotation={[0, 0, -.05]}>
      <mesh geometry={resources.cylinder} material={r.actorCloth} position={[0, -.27, 0]} scale={[.055, .54, .055]} />
      <mesh geometry={resources.cylinder} material={r.actorPorcelain} position={[0, -.65, 0]} scale={[.042, .25, .042]} />
      <mesh geometry={r.actorHead} material={r.actorPorcelain} position={[0, -.84, 0]} scale={[.048, .11, .065]} />
    </group>
    <group ref={rightArm} position={[.34, 1.42, 0]} rotation={[0, 0, .015]}>
      <mesh name="actor-long-upper-arm" geometry={resources.cylinder} material={r.actorCloth} position={[0, -.34, 0]} scale={[.05, .68, .05]} />
      <mesh name="actor-long-forearm" geometry={resources.cylinder} material={r.actorPorcelain} position={[0, -.84, 0]} scale={[.035, .35, .035]} />
      <mesh name="actor-long-hand" geometry={r.actorHead} material={r.actorPorcelain} position={[0, -1.12, 0]} scale={[.042, .12, .07]} />
    </group>
    {[-1, 1].map(sign => <group key={sign} ref={sign < 0 ? leftLeg : rightLeg} position={[sign * .115, .73, 0]}>
      <mesh geometry={resources.cylinder} material={r.actorCloth} position={[0, -.28, 0]} scale={[.07, .56, .07]} />
      <mesh geometry={resources.box} material={r.actorPorcelain} position={[0, -.66, -.045]} scale={[.13, .14, .23]} />
    </group>)}
  </group>;
}
