/* eslint-disable react/no-unknown-property -- R3F scene intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { GALLERY_HYBRID_FIXTURE, GALLERY_MASK_FIXTURE, GALLERY_WIRING_FIXTURE, getWiringSpec } from '../../domain/gallery';
import { createPanelFixture } from '../../domain/firstPerson/panelFixture';
import type { ChapterRuntime } from '../../domain/firstPerson/types';
import { PanelFixture } from './PanelFixture';
import { computeSegmentTransform } from './segmentTransform';
import type { SceneResources } from './resources';

const wiringFixture = createPanelFixture(GALLERY_WIRING_FIXTURE);
const hybridFixture = createPanelFixture(GALLERY_HYBRID_FIXTURE);
function fixtureRotation(fixture: typeof GALLERY_WIRING_FIXTURE) {
  const n = new THREE.Vector3(fixture.normal.x, fixture.normal.y, fixture.normal.z);
  const r = new THREE.Vector3(fixture.right.x, fixture.right.y, fixture.right.z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, new THREE.Vector3().crossVectors(n, r), n));
}
export function PerceptualGalleryExhibits({ resources, runtime }: { resources: SceneResources; runtime: RefObject<ChapterRuntime> }) {
  const r = resources.galleryResources!;
  const maskRotation = useMemo(() => fixtureRotation(GALLERY_MASK_FIXTURE), []);
  return <group name="perceptual-gallery-exhibits" dispose={null}>
    {/* No frame callback, camera parameter, negative scale or swapped surface. */}
    <mesh name="gallery-static-hollow-mask" geometry={r.perceptual.maskGeometry} material={r.perceptual.maskMaterial}
      position={[GALLERY_MASK_FIXTURE.center.x, GALLERY_MASK_FIXTURE.center.y, GALLERY_MASK_FIXTURE.center.z]} quaternion={maskRotation} />
    <PanelFixture name="hybrid-exhibit" fixture={hybridFixture} box={resources.box} plane={resources.plane}
      surface={r.perceptual.hybridMaterial} backing={resources.dark} frame={resources.trim} />
    <WiringFixture resources={resources} runtime={runtime} />
  </group>;
}
function WiringFixture({ resources, runtime }: { resources: SceneResources; runtime: RefObject<ChapterRuntime> }) {
  const r = resources.galleryResources!, line = useRef<THREE.Group>(null), cover = useRef<THREE.Group>(null);
  const lineHandle = useRef<THREE.Mesh>(null), coverHandle = useRef<THREE.Mesh>(null);
  const spec = useMemo(() => getWiringSpec({ offset: 0, cover: 0 }), []);
  const rotation = useMemo(() => fixtureRotation(GALLERY_WIRING_FIXTURE), []);
  const fixed = useMemo(() => computeSegmentTransform({ ...spec.fixedLine[0], z: .025 }, { ...spec.fixedLine[1], z: .025 }, .011), [spec]);
  const moving = useMemo(() => computeSegmentTransform({ ...spec.movableLine[0], z: .025 }, { ...spec.movableLine[1], z: .025 }, .011), [spec]);
  useFrame(() => {
    const live = runtime.current.gallery;
    if (!live) return;
    if (line.current) line.current.position.y = live.wiringOffset;
    if (cover.current) cover.current.position.x = live.wiringCover;
    if (lineHandle.current) lineHandle.current.material = live.activeDrag?.kind === 'wiring' && live.activeDrag.control === 'line' ? r.selected : r.outline;
    if (coverHandle.current) coverHandle.current.material = live.activeDrag?.kind === 'wiring' && live.activeDrag.control === 'cover' ? r.selected : r.outline;
  });
  return <group name="gallery-wiring">
    <PanelFixture name="wiring" fixture={wiringFixture} box={resources.box} plane={resources.plane}
      surface={r.bright} backing={resources.dark} frame={resources.trim} />
    <group name="wiring-local" position={[wiringFixture.center.x, wiringFixture.center.y, wiringFixture.center.z]} quaternion={rotation}>
      <mesh name="wiring-fixed-line" geometry={resources.cylinder} material={r.ink} position={fixed.position} quaternion={fixed.quaternion} scale={fixed.scale} />
      <group name="wiring-moving-line" ref={line} position={[0, runtime.current.gallery!.wiringOffset, 0]}>
        <mesh name="wiring-movable-centerline" geometry={resources.cylinder} material={r.ink} position={moving.position} quaternion={moving.quaternion} scale={moving.scale} />
        <mesh name="wiring-line-connector" geometry={resources.box} material={r.ink} position={[.82, spec.handles.line.center.y, .025]} scale={[.2, .013, .016]} />
        <mesh name="wiring-line-handle" ref={lineHandle} geometry={resources.box} material={r.outline}
          position={[spec.handles.line.center.x, spec.handles.line.center.y, .054]} scale={[.26, .18, .048]} />
        <mesh name="wiring-line-grip" geometry={resources.box} material={r.ink} position={[.96, spec.handles.line.center.y, .081]} scale={[.11, .035, .008]} />
      </group>
      <group name="wiring-cover" ref={cover} position={[runtime.current.gallery!.wiringCover, 0, 0]}>
        <mesh name="wiring-opaque-cover" geometry={resources.box} material={resources.device} position={[0, 0, .066]} scale={[spec.cover.width, spec.cover.height, .032]} />
        <mesh name="wiring-cover-handle" ref={coverHandle} geometry={resources.box} material={r.outline}
          position={[0, spec.handles.cover.center.y, .098]} scale={[.3, .15, .028]} />
        <mesh name="wiring-cover-grip" geometry={resources.box} material={r.ink} position={[0, spec.handles.cover.center.y, .116]} scale={[.12, .035, .008]} />
      </group>
    </group>
  </group>;
}
