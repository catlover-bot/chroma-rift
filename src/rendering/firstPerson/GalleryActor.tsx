/* eslint-disable react/no-unknown-property -- R3F scene intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useMemo, type RefObject } from 'react';
import type { ChapterRuntime } from '../../domain/firstPerson/types';
import { createActorArtRig, type ActorArtSource } from './actorArtRig';
import type { SceneResources } from './resources';

/** One authored body for all five areas and their reflections. The simulation
 * supplies root, eyes, planted feet and the committed final stop clock. */
export function GalleryActor({ runtime, resources, reducedMotion: _reducedMotion, actorSource, name = 'gallery-exhibit-actor', onFrameError, framePriority = 0 }: {
  runtime: RefObject<ChapterRuntime>; resources: SceneResources; reducedMotion: boolean;
  actorSource?: () => ActorArtSource | undefined; name?: string;
  onFrameError?: ((error: unknown) => void) | undefined; framePriority?: number;
}) {
  const rig = useMemo(() => createActorArtRig(resources.galleryResources!.actorArt, name), [resources, name]);
  const source = () => actorSource ? actorSource() : runtime.current.gallery?.actor;
  const actor = source();
  rig.apply(actor);
  useFrame(() => {
    try {
      const actor = source();
      rig.apply(actor);
    } catch (error) { if (onFrameError) onFrameError(error); else throw error; }
  }, framePriority);
  // Materials/geometries belong to the scene owner, including replay disposal.
  return <primitive object={rig.root} dispose={null} />;
}
