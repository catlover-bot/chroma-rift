/* eslint-disable react/no-unknown-property -- R3F scene intrinsics. */
import type { SceneResources } from './resources';

/** A separate educational instance shares immutable geometry; the in-world
 * mask transform is untouched and no new renderer/context/resource is allocated. */
export function NotebookMaskScene({ resources }: { resources: SceneResources }) {
  const r = resources.galleryResources!.perceptual;
  return <group name="notebook-mask-scene" dispose={null}>
    <ambientLight intensity={.9} />
    <directionalLight position={[-2, 3, 4]} intensity={1.5} />
    <mesh name="notebook-hollow-mask" geometry={r.maskGeometry} material={r.maskMaterial} />
  </group>;
}
