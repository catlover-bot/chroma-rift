/* eslint-disable react/no-unknown-property -- R3F Three intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useRef } from 'react';
import type { Group, Material, Mesh } from 'three';
import type { SceneResources } from './resources';
import { computeSegmentTransform } from './segmentTransform';
import type { Vec3 } from '../../domain/firstPerson/types';

export function Cable({ points, resources, width = .018, material }: {
  points: readonly Vec3[]; resources: SceneResources; width?: number; material?: Material }) {
  return <group name="physical-cable">{points.slice(1).map((point, i) => {
    const transform = computeSegmentTransform(points[i]!, point, width);
    return <mesh key={i} geometry={resources.cylinder} material={material ?? resources.art.rubber}
      position={transform.position} quaternion={transform.quaternion} scale={transform.scale}/>;
  })}</group>;
}

export function MechanismBolts({ resources, width, height }: { resources: SceneResources; width: number; height: number }) {
  return <group name="mounting-fasteners">{[-1, 1].flatMap(x => [-1, 1].map(y =>
    <mesh key={`${x}:${y}`} geometry={resources.cylinder} material={resources.art.metal}
      position={[x * width / 2, y * height / 2, .006]} rotation={[Math.PI / 2, 0, 0]} scale={[.015, .016, .015]}/>))}</group>;
}

/** One real pivot and authored gripping bar. Progress is read from committed
 * stage state; visual callbacks never advance puzzle or actor simulation. */
export function WinchModel({ resources, practice, state }: { resources: SceneResources; practice: boolean;
  state: () => { holding: boolean; progress: number; ratchets: number; complete: boolean } }) {
  const pivot = useRef<Group>(null), weight = useRef<Mesh>(null), marks = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    const current = state();
    if (pivot.current) pivot.current.rotation.x = current.complete ? -.72 : current.holding ? -.36 - current.progress * .26 : .15;
    if (weight.current) weight.current.position.y = -.48 + .25 * (current.complete ? 1 : current.progress);
    marks.current.forEach((mark, i) => { if (mark) { mark.position.y = -.38 + (current.ratchets > i ? .09 : 0);
      mark.material = current.ratchets > i ? resources.art.brass : resources.art.metal; } });
  }, -.45);
  const art = resources.art;
  return <group name={practice ? 'practice-pulley-bench' : 'floor-mounted-winch'}>
    <mesh name="mechanism-contact" geometry={resources.plane} material={art.contact}
      position={[-.08, -1.393, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[.72, .82, 1]}/>
    <mesh name="mechanism-fixed-body" geometry={art.beveled} material={practice ? art.timber : art.enamel}
      position={[-.16, practice ? -.57 : -.49, 0]} scale={[.48, practice ? .12 : .84, .65]}/>
    {[-.23, .23].map(z => <mesh key={z} name="floor-fixed-feet" geometry={art.beveled} material={art.metal}
      position={[-.16, -1.03, z]} scale={[practice ? .065 : .42, .73, .065]}/>)}
    <mesh geometry={art.beveled} material={art.metal} position={[-.12, -1.365, 0]} scale={[.6, .06, .77]}/>
    <mesh name="axle-mount" geometry={art.beveled} material={art.metal} position={[-.12, -.17, 0]} scale={[.16, .3, .34]}/>
    <mesh name="visible-winding-drum" geometry={resources.cylinder} material={art.rubber}
      position={[-.22, -.1, 0]} rotation={[0, 0, Math.PI / 2]} scale={[.14, .18, .14]}/>
    <group name="grip-pivot" ref={pivot} position={[.05, -.13, 0]}>
      <mesh geometry={art.beveled} material={art.metal} position={[0, .07, 0]} scale={[.045, .24, .055]}/>
      <mesh name="gripping-bar" geometry={art.beveled} material={art.rubber} position={[.04, .15, 0]} scale={[.1, .08, practice ? .2 : .44]}/>
    </group>
    {practice ? <>
      <mesh name="practice-pulley" geometry={art.pulley} material={art.brass} position={[-.25, .15, -.24]} rotation={[0, Math.PI / 2, 0]} scale={[.48, .48, .48]}/>
      <Cable resources={resources} width={.012} points={[{ x: -.25, y: -.43, z: -.33 }, { x: -.25, y: .15, z: -.33 }, { x: -.25, y: .23, z: -.24 }, { x: -.25, y: .15, z: -.15 }, { x: -.25, y: -.05, z: -.15 }]}/>
      <mesh name="practice-visible-weight" ref={weight} geometry={art.beveled} material={art.metal} position={[-.25, -.48, -.33]} scale={[.12, .18, .12]}/>
    </> : <>
      {[-.2, 0, .2].map((z, i) => <group key={z}>
        <mesh name={`ratchet-slot-${i + 1}`} geometry={art.beveled} material={art.rubber} position={[.087, -.35, z]} scale={[.02, .2, .12]}/>
        <mesh name={`physical-ratchet-${i + 1}`} ref={mesh => { marks.current[i] = mesh; }} geometry={art.beveled} material={art.metal} position={[.11, -.38, z]} scale={[.065, .06, .08]}/>
        {Array.from({ length: i + 1 }, (_, n) => <mesh key={n} geometry={resources.box} material={art.marking}
          position={[.105, -.54, z + (n - i / 2) * .025]} scale={[.01, .055, .01]}/>)}
      </group>)}
      <mesh name="cable-top-pulley" geometry={art.pulley} material={art.metal} position={[-.21, .74, 0]} rotation={[0, Math.PI / 2, 0]}/>
      <Cable resources={resources} points={[{ x: -.22, y: -.02, z: .14 }, { x: -.22, y: .74, z: .19 }, { x: -.22, y: .93, z: 0 }]}/>
    </>}
  </group>;
}

export function PhysicalBell({ resources, name = 'bell', ringing = false }: { resources: SceneResources; name?: string; ringing?: boolean }) {
  return <group name={name}>
    <mesh geometry={resources.art.beveled} material={resources.art.enamel} position={[0, -.05, 0]} scale={[.42, .1, .38]}/>
    <mesh name={`${name}-cast-bell`} geometry={resources.art.bell} material={resources.art.brass} scale={[.48, .48, .48]} rotation={[0, 0, ringing ? .08 : 0]}/>
    <mesh name={`${name}-push-plunger`} geometry={resources.cylinder} material={resources.art.rubber} position={[0, .18, 0]} scale={[.035, .11, .035]}/>
  </group>;
}

export function GuardedLever({ resources, power = false, active = false }: { resources: SceneResources; power?: boolean; active?: boolean }) {
  return <group name={power ? 'power-disconnect-lever' : 'guarded-isolation-lever'}>
    <mesh geometry={resources.art.beveled} material={resources.art.enamel} scale={[.33, .075, .34]}/>
    <mesh geometry={resources.art.beveled} material={resources.art.rubber} position={[0, .04, 0]} scale={[.08, .02, .27]}/>
    {!power && [-.13, .13].map(x => <mesh key={x} geometry={resources.art.beveled} material={resources.art.metal}
      position={[x, .11, 0]} scale={[.035, .18, .32]}/>)}
    <group name="actuator-pivot" rotation={[active ? -.65 : .5, 0, 0]}>
      <mesh geometry={resources.cylinder} material={resources.art.metal} position={[0, .12, 0]} scale={[.018, .24, .018]}/>
      <mesh name="lever-grip" geometry={resources.art.beveled} material={power ? resources.art.rubber : resources.art.brass}
        position={[0, .25, 0]} scale={power ? [.22, .06, .06] : [.085, .06, .06]}/>
    </group>
  </group>;
}
