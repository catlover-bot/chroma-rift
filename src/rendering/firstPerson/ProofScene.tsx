/* eslint-disable react/no-unknown-property -- R3F meshes use Three properties. */
import { useLayoutEffect } from 'react';

export const PROOF_CAMERA = { position: [0, 1.6, 2] as [number, number, number], fov: 60, near: 0.1, far: 30 };
export const PROOF_OBJECTS = [
  { name: 'proof-box', position: [0, 1, -3.5], scale: [1.5, 2, 1.5], color: '#D79D5A' },
  { name: 'proof-floor', position: [0, -0.1, -4], scale: [8, 0.2, 12], color: '#849083' },
  { name: 'proof-wall', position: [0, 2, -8], scale: [8, 4, 0.2], color: '#467A9D' },
] satisfies { name: string; position: [number, number, number]; scale: [number, number, number]; color: string }[];

/** Development isolation geometry inside the same native Canvas/bootstrap.
 * No camera/input loop, checkpoint, lighting, texture, fog or external asset. */
export function ProofScene({ onCommit }: { onCommit?: () => void }) {
  useLayoutEffect(() => { onCommit?.(); }, [onCommit]);
  return <group name="native-proof-scene">
    {PROOF_OBJECTS.map((object) => <mesh key={object.name} name={object.name} position={object.position} scale={object.scale}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={object.color} fog={false} toneMapped={false} />
    </mesh>)}
  </group>;
}
