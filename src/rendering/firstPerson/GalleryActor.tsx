/* eslint-disable react/no-unknown-property -- R3F scene intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { actorLegKnee, sampleActorPose, type ActorMotionState } from '../../domain/actorMotion';
import type { ChapterRuntime } from '../../domain/firstPerson/types';
import type { SceneResources } from './resources';

/** Presentation only. The same simulation owns root, eyes and planted feet in
 * both chapters; no render-frame clocks, root motion or extra renderer. */
export function GalleryActor({ runtime, resources, reducedMotion: _reducedMotion, actorSource, name = 'gallery-exhibit-actor', onFrameError }: {
  runtime: RefObject<ChapterRuntime>; resources: SceneResources; reducedMotion: boolean;
  actorSource?: () => { motion: ActorMotionState; visible: boolean } | undefined; name?: string; onFrameError?: ((error: unknown) => void) | undefined;
}) {
  const body = useRef<THREE.Group>(null), chest = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null), rightArm = useRef<THREE.Group>(null);
  const leftElbow = useRef<THREE.Group>(null), rightElbow = useRef<THREE.Group>(null);
  const bones = useRef<Record<string, THREE.Mesh | null>>({});
  const direction = useMemo(() => new THREE.Vector3(), []), up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const r = resources.galleryResources!;
  const source = () => actorSource ? actorSource() : runtime.current.gallery?.actor;
  useFrame(() => {
    try {
      const actor = source(), group = body.current;
      if (!actor || !group) return;
      const motion = actor.motion, pose = sampleActorPose(motion);
      group.visible = actor.visible; group.position.set(motion.position.x, motion.position.y, motion.position.z); group.rotation.y = motion.yaw;
      if (chest.current) { chest.current.position.x = pose.pelvisShift; chest.current.rotation.set(pose.chestLean, pose.chestYaw, 0, 'YXZ'); }
      if (head.current) { head.current.position.set(pose.headPosition.x, pose.headPosition.y, pose.headPosition.z); head.current.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll, 'YXZ'); }
      if (leftArm.current) leftArm.current.rotation.x = pose.leftArm;
      if (rightArm.current) rightArm.current.rotation.x = pose.rightArm;
      if (leftElbow.current) leftElbow.current.rotation.x = pose.leftElbow;
      if (rightElbow.current) rightElbow.current.rotation.x = pose.rightElbow;
      const bone = (id: string, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, radius: number) => {
        const mesh = bones.current[id]; if (!mesh) return;
        direction.set(b.x - a.x, b.y - a.y, b.z - a.z);
        const length = direction.length(); mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        mesh.scale.set(radius, length, radius); mesh.quaternion.setFromUnitVectors(up, direction.normalize());
      };
      for (const side of [-1, 1] as const) {
        const foot = side < 0 ? pose.leftFoot : pose.rightFoot;
        const hip = { x: side * .105 + pose.pelvisShift, y: .87, z: .02 }, ankle = { x: foot.position.x, y: .14 + foot.position.y, z: foot.position.z };
        const knee = actorLegKnee(hip, ankle);
        bone(side + '-upper', hip, knee, .063); bone(side + '-lower', knee, ankle, .046);
        const sole = bones.current[side + '-foot'];
        if (sole) { sole.position.set(foot.position.x, .07 + foot.position.y, foot.position.z); sole.rotation.y = foot.yaw; }
        const joint = bones.current[side + '-knee']; if (joint) joint.position.set(knee.x, knee.y, knee.z);
      }
    } catch (error) { if (onFrameError) onFrameError(error); else throw error; }
  });
  const actor = source(), motion = actor?.motion;
  return <group ref={body} name={name} visible={!!actor?.visible} position={motion ? [motion.position.x, motion.position.y, motion.position.z] : [0, 0, 9]} rotation={[0, motion?.yaw ?? 0, 0]} dispose={null}>
    <group ref={chest} name="actor-delayed-chest" position={[0, 1.23, 0]}>
      <mesh name="actor-tailored-coat" geometry={r.actorCoat} material={r.actorCloth} position={[0, -1.23, 0]} />
      <mesh name="actor-back-fold" geometry={resources.box} material={r.actorDark} position={[-.035, -.13, .212]} rotation={[0, 0, -.08]} scale={[.12, .6, .025]} />
      <mesh name="actor-raised-shoulder" geometry={r.actorBody} material={r.actorPorcelain} position={[-.24, .36, 0]} scale={[.15, .16, .17]} />
      <mesh name="actor-lower-shoulder" geometry={r.actorBody} material={r.actorCloth} position={[.25, .22, 0]} scale={[.11, .1, .15]} />
      <mesh name="actor-neck" geometry={resources.cylinder} material={r.actorDark} position={[.015, .5, 0]} scale={[.07, .18, .07]} />
      <group ref={leftArm} position={[-.285, .3, 0]} rotation={[0, 0, -.035]}>
        <mesh geometry={resources.cylinder} material={r.actorCloth} position={[0, -.245, 0]} scale={[.058, .49, .06]} />
        <group ref={leftElbow} name="actor-left-elbow-pivot" position={[0, -.51, 0]}>
          <mesh name="actor-left-elbow" geometry={r.actorBody} material={r.actorDark} scale={[.063, .075, .06]} />
          <mesh geometry={resources.cylinder} material={r.actorPorcelain} position={[0, -.16, -.02]} scale={[.039, .29, .044]} />
          <mesh geometry={r.actorHead} material={r.actorPorcelain} position={[0, -.35, -.025]} scale={[.044, .105, .06]} />
        </group>
      </group>
      <group ref={rightArm} position={[.30, .19, 0]} rotation={[0, 0, .015]}>
        <mesh name="actor-long-upper-arm" geometry={resources.cylinder} material={r.actorCloth} position={[0, -.3, 0]} scale={[.054, .6, .055]} />
        <group ref={rightElbow} name="actor-right-elbow-pivot" position={[0, -.62, 0]}>
          <mesh name="actor-right-elbow" geometry={r.actorBody} material={r.actorDark} scale={[.057, .08, .058]} />
          <mesh name="actor-long-forearm" geometry={resources.cylinder} material={r.actorPorcelain} position={[0, -.22, -.01]} scale={[.033, .37, .042]} />
          <mesh name="actor-long-hand" geometry={r.actorHead} material={r.actorPorcelain} position={[0, -.50, -.012]} scale={[.039, .12, .06]} />
        </group>
      </group>
    </group>
    <group ref={head} name="actor-leading-head" position={[.015, 1.95, -.015]} rotation={[0, 0, -.06]}>
      <mesh name="actor-head-shell" geometry={r.actorHead} material={r.actorDark} position={[0, 0, .05]} scale={[.158, .205, .115]} />
      <mesh name="actor-convex-face" geometry={r.perceptual.convexControlGeometry} material={r.actorPorcelain} position={[0, 0, -.032]} rotation={[0, Math.PI, 0]} scale={[.36, .36, .36]} />
      <mesh name="actor-face-fastener" geometry={resources.box} material={r.actorDark} position={[.14, -.065, -.042]} rotation={[0, 0, -.15]} scale={[.022, .09, .016]} />
    </group>
    {([-1, 1] as const).map(side => <group key={side} name={'actor-leg-' + side}>
      <mesh name={'actor-thigh-' + side} ref={m => { bones.current[side + '-upper'] = m; }} geometry={resources.cylinder} material={r.actorCloth} />
      <mesh name={'actor-shin-' + side} ref={m => { bones.current[side + '-lower'] = m; }} geometry={resources.cylinder} material={r.actorPorcelain} />
      <mesh name={'actor-knee-' + side} ref={m => { bones.current[side + '-knee'] = m; }} geometry={r.actorBody} material={r.actorDark} scale={[.068, .073, .067]} />
      <mesh name={'actor-planted-foot-' + side} ref={m => { bones.current[side + '-foot'] = m; }} geometry={resources.box} material={r.actorDark} scale={[.14, .14, .27]} />
    </group>)}
  </group>;
}
