/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { createPanelFixture } from '../../domain/firstPerson/panelFixture';
import type { ChapterRuntime } from '../../domain/firstPerson/types';
import { VAULT_CAFE_FIXTURE, VAULT_LENGTH_FIXTURE, VAULT_ROD_FIXTURE } from '../../domain/vault/definition';
import { CAFE_SPEC, LENGTH_SPEC, ROD_SPEC, finSegments } from '../../domain/vault/specs';
import { vaultTargetAngle } from '../../domain/vault/state';
import { PanelFixture } from './PanelFixture';
import type { SceneResources } from './resources';
const lengthFixture = createPanelFixture(VAULT_LENGTH_FIXTURE), rodFixture = createPanelFixture(VAULT_ROD_FIXTURE);
function orientation(f: typeof lengthFixture) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(f.right.x, f.right.y, f.right.z), new THREE.Vector3(f.up.x, f.up.y, f.up.z), new THREE.Vector3(f.normal.x, f.normal.y, f.normal.z)));
}
const referenceFins = finSegments(LENGTH_SPEC.targetLength, true);
const movingFins = finSegments(0, false);
const cafes = Array.from({ length: CAFE_SPEC.rows }, (_, row) => {
  const h = (CAFE_SPEC.height - CAFE_SPEC.mortarWidth * (CAFE_SPEC.rows - 1)) / CAFE_SPEC.rows;
  const shift = row % 2 * CAFE_SPEC.rowOffset;
  return Array.from({ length: 8 }, (_, col) => {
    const left = Math.max(-CAFE_SPEC.width / 2, -CAFE_SPEC.width / 2 + (col - 1) * CAFE_SPEC.tileWidth + shift);
    const right = Math.min(CAFE_SPEC.width / 2, -CAFE_SPEC.width / 2 + col * CAFE_SPEC.tileWidth + shift);
    return { id: row + '-' + col, x: (left + right) / 2, y: CAFE_SPEC.height / 2 - h / 2 - row * (h + CAFE_SPEC.mortarWidth), width: right - left, height: h, dark: col % 2 === 0 };
  }).filter(t => t.width > 0);
}).flat();
type Props = { runtime: RefObject<ChapterRuntime>; resources: SceneResources; onFrameError?: ((error: unknown) => void) | undefined };
function useDeviceFrame(callback: () => void, onFrameError: Props['onFrameError']) {
  useFrame(() => { try { callback(); } catch (error) { if (onFrameError) onFrameError(error); else throw error; } });
}
function Fin({ from, to, resources }: { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; resources: SceneResources }) {
  return <mesh name="vault-fin" geometry={resources.box} material={resources.vaultResources!.shaft}
    position={[(from.x + to.x) / 2, (from.y + to.y) / 2, from.z]} rotation={[0, 0, Math.atan2(to.y - from.y, to.x - from.x)]}
    scale={[Math.hypot(to.x - from.x, to.y - from.y), LENGTH_SPEC.shaftWidth, .025]} />;
}
export function VaultLengthDevice({ runtime, resources, onFrameError }: Props) {
  const variable = useRef<THREE.Mesh>(null), rightFins = useRef<THREE.Group>(null), decorations = useRef<THREE.Group>(null),
    handle = useRef<THREE.Group>(null), guide = useRef<THREE.Group>(null), latch = useRef<THREE.Group>(null), comparison = useRef<THREE.Group>(null);
  const rotation = useMemo(() => orientation(lengthFixture), []);
  const m = resources.vaultResources!, l = runtime.current.vault?.length ?? LENGTH_SPEC.initialLength;
  useDeviceFrame(() => {
    const v = runtime.current.vault, p = runtime.current.progress.vault;
    if (!v || !p) return;
    if (variable.current) { variable.current.position.x = LENGTH_SPEC.left + v.length / 2; variable.current.scale.x = v.length; }
    if (rightFins.current) rightFins.current.position.x = v.length;
    if (handle.current) handle.current.position.x = LENGTH_SPEC.left + v.length;
    if (decorations.current) decorations.current.visible = !p.aids.finsHidden;
    if (guide.current) guide.current.visible = p.aids.lengthGuide;
    if (latch.current) latch.current.rotation.x = -.75 * (1-v.lengthGateOpen);
    if (comparison.current) comparison.current.rotation.z = p.aids.finsHidden ? Math.PI/2 : 0;
  }, onFrameError);
  return <group name="vault-length-device" dispose={null}>
    <PanelFixture name="vault-length" fixture={lengthFixture} box={resources.box} plane={resources.plane} surface={m.board} backing={resources.dark} frame={resources.trim} />
    <group name="vault-length-local-plane" position={[lengthFixture.center.x, lengthFixture.center.y, lengthFixture.center.z]} quaternion={rotation}>
      <mesh name="vault-reference-shaft" geometry={resources.box} material={m.shaft}
        position={[LENGTH_SPEC.left + LENGTH_SPEC.targetLength / 2, LENGTH_SPEC.referenceY, LENGTH_SPEC.shaftDepth]}
        scale={[LENGTH_SPEC.targetLength, LENGTH_SPEC.shaftWidth, .025]} />
      <mesh name="vault-variable-shaft" ref={variable} geometry={resources.box} material={m.shaft}
        position={[LENGTH_SPEC.left + l / 2, LENGTH_SPEC.sliderY, LENGTH_SPEC.shaftDepth]} scale={[l, LENGTH_SPEC.shaftWidth, .025]} />
      <group ref={decorations} name="vault-length-context" visible={!runtime.current.progress.vault?.aids.finsHidden}>
        {referenceFins.map((segment, i) => <Fin key={i} {...segment} resources={resources} />)}
        {movingFins.slice(0, 2).map((segment, i) => <Fin key={'left-' + i} {...segment} resources={resources} />)}
        <group ref={rightFins} position={[l, 0, 0]}>{movingFins.slice(2).map((segment, i) => <Fin key={'right-' + i} {...segment} resources={resources} />)}</group>
      </group>
      <group name="vault-length-handle" ref={handle} position={[LENGTH_SPEC.left+l,LENGTH_SPEC.sliderY,.05]}>
        <mesh geometry={resources.ring} material={resources.art.brass} scale={[.41,.41,1]}/>
        <mesh name="vault-slider-finger-grip" geometry={resources.art.beveled} material={resources.art.rubber} position={[0,-.12,.045]} scale={[.18,.08,.09]}/>
        <mesh name="vault-slider-stem" geometry={resources.box} material={resources.art.metal} position={[0,-.065,.025]} scale={[.035,.13,.035]}/>
      </group>
      <group name="vault-fixed-reference-mount" position={[LENGTH_SPEC.left+LENGTH_SPEC.targetLength/2,LENGTH_SPEC.referenceY+.15,.03]}>
        <mesh geometry={resources.art.beveled} material={resources.art.metal} scale={[.18,.11,.035]}/>
        {[-1,1].map(side => <mesh key={side} name="vault-reference-fastener" geometry={resources.cylinder} material={resources.art.brass}
          position={[side*.055,0,.03]} rotation={[Math.PI/2,0,0]} scale={[.018,.025,.018]}/>)}
      </group>
      <group ref={guide} name="vault-length-measurement-guide" visible={!!runtime.current.progress.vault?.aids.lengthGuide}>
        {[LENGTH_SPEC.left, LENGTH_SPEC.left + LENGTH_SPEC.targetLength].map(x => <mesh key={x} geometry={resources.box} material={m.guide} position={[x, 0, .055]} scale={[.012, 1.05, .005]} />)}
      </group>
      <mesh name="vault-length-slot" geometry={resources.box} material={resources.dark} position={[0, -.65, .02]} scale={[.34, .10, .08]} />
      <group name="vault-length-lock" ref={latch} position={[0,-.69,.055]}>
        <mesh name="vault-confirm-clamp-arm" geometry={resources.art.beveled} material={resources.art.metal} position={[0,.07,.045]} scale={[.045,.15,.045]}/>
        <mesh name="vault-confirm-clamp-grip" geometry={resources.art.beveled} material={resources.art.rubber} position={[0,.14,.065]} scale={[.28,.07,.08]}/>
      </group>
      <group name="vault-comparison-folding-control" ref={comparison} position={[-.88,-.65,.035]}>
        <mesh name="vault-comparison-pivot" geometry={resources.cylinder} material={resources.art.metal} rotation={[Math.PI/2,0,0]} scale={[.045,.05,.045]}/>
        {[-1,1].map(side => <mesh key={side} name="vault-comparison-leaf" geometry={resources.art.beveled} material={resources.art.brass}
          position={[side*.065,.025,.035]} rotation={[0,0,side*Math.PI/4]} scale={[.11,.055,.035]}/>)}
      </group>
    </group>
  </group>;
}
export function VaultRodDevice({ runtime, resources, onFrameError }: Props) {
  const needle = useRef<THREE.Group>(null), frame = useRef<THREE.Group>(null), plumb = useRef<THREE.Group>(null);
  const rotation = useMemo(() => orientation(rodFixture), []), target = vaultTargetAngle(), m = resources.vaultResources!;
  const angle = runtime.current.vault?.angle ?? ROD_SPEC.initialAngle;
  useDeviceFrame(() => {
    const v = runtime.current.vault, p = runtime.current.progress.vault; if (!v || !p) return;
    if (needle.current) needle.current.rotation.z = -v.angle;
    if (frame.current) frame.current.visible = !p.aids.frameHidden;
    if (plumb.current) plumb.current.visible = p.aids.plumb;
  }, onFrameError);
  return <group name="vault-rod-device" dispose={null}>
    <PanelFixture name="vault-rod" fixture={rodFixture} box={resources.box} plane={resources.plane} surface={m.board} backing={resources.dark} frame={resources.trim} />
    <group name="vault-rod-local-plane" position={[rodFixture.center.x, rodFixture.center.y, rodFixture.center.z]} quaternion={rotation}>
      <group name="vault-tilted-frame" ref={frame} rotation={[0, 0, -ROD_SPEC.frameAngle]} visible={!runtime.current.progress.vault?.aids.frameHidden}>
        {[-1, 1].flatMap(sign => [
          <mesh key={'h' + sign} geometry={resources.box} material={m.shaft} position={[0, sign * ROD_SPEC.frameSize / 2, .025]} scale={[ROD_SPEC.frameSize + .025, .025, .02]} />,
          <mesh key={'v' + sign} geometry={resources.box} material={m.shaft} position={[sign * ROD_SPEC.frameSize / 2, 0, .025]} scale={[.025, ROD_SPEC.frameSize, .02]} />,
        ])}
      </group>
      <group name="vault-vertical-needle" ref={needle} rotation={[0, 0, -angle]}>
        <mesh name="vault-rod-shaft" geometry={resources.box} material={m.shaft} position={[0, 0, .025]} scale={[.035, ROD_SPEC.length, .025]} />
        {[-1, 1].map(sign => <mesh key={sign} name={'vault-rod-handle-' + sign} geometry={resources.ring} material={resources.galleryResources!.warm}
          position={[0, sign * ROD_SPEC.length / 2, .05]} scale={[.41, .41, 1]} />)}
      </group>
      <mesh name="vault-rod-axle" geometry={resources.box} material={resources.galleryResources!.warm} position={[0, 0, .05]} scale={[.09, .09, .03]} />
      <group name="vault-plumb-reference" ref={plumb} position={[-.74, 0, .075]} rotation={[0, 0, -target]} visible={!!runtime.current.progress.vault?.aids.plumb}>
        <mesh geometry={resources.box} material={m.guide} scale={[.012, 1.35, .01]} />
        <mesh geometry={resources.box} material={m.guide} position={[0, -.7, 0]} rotation={[0, 0, Math.PI / 4]} scale={[.10, .10, .04]} />
      </group>
    </group>
  </group>;
}
export function VaultCafeWall({ runtime, resources, onFrameError }: Props) {
  const tiles = useRef<(THREE.Mesh | null)[]>([]), m = resources.vaultResources!;
  useDeviceFrame(() => { const neutral = runtime.current.progress.vault?.aids.cafeNeutral;
    tiles.current.forEach((mesh, i) => { if (mesh) mesh.material = neutral ? m.light : cafes[i]!.dark ? m.dark : m.light; });
  }, onFrameError);
  return <group name="vault-cafe-wall" position={[VAULT_CAFE_FIXTURE.center.x, VAULT_CAFE_FIXTURE.center.y, VAULT_CAFE_FIXTURE.center.z]} rotation={[0, Math.PI / 2, 0]} dispose={null}>
    <mesh name="vault-straight-mortar-plane" geometry={resources.plane} material={m.mortar} scale={[CAFE_SPEC.width, CAFE_SPEC.height, 1]} />
    {cafes.map((t, i) => <mesh key={t.id} name={'vault-cafe-tile-' + t.id} ref={mesh => { tiles.current[i] = mesh; }} geometry={resources.plane}
      material={runtime.current.progress.vault?.aids.cafeNeutral ? m.light : t.dark ? m.dark : m.light} position={[t.x, t.y, .002]} scale={[t.width, t.height, 1]} />)}
  </group>;
}
