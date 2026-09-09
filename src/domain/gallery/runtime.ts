import { createBaseRuntime, initialProgress } from '../firstPerson/baseRuntime';
import type { ChapterRuntime, CheckpointState } from '../firstPerson/types';
import { GALLERY_CHAPTER_ID, GALLERY_SPAWN } from './definition';
import { initialGalleryProgress, initialGalleryTransient } from './state';
import type { GalleryProgress } from './types';

/** A cold constructor owns its saved values; separate sessions cannot mutate
 * each other or the checkpoint from which they were restored. */
function copyProgress(saved: GalleryProgress): GalleryProgress {
  return { ...saved, wiring: { ...saved.wiring }, discoveries: { ...saved.discoveries },
    shadow: { ...saved.shadow, assignments: { ...saved.shadow.assignments } },
    contour: { ...saved.contour, angles: [...saved.contour.angles] }, order: [...saved.order],
    powerTaken: { ...saved.powerTaken }, story: { ...saved.story } };
}
export function createGalleryRuntime(checkpoint?: CheckpointState, session?: number, seed?: number): ChapterRuntime {
  if (checkpoint && checkpoint.chapterId !== GALLERY_CHAPTER_ID) throw new RangeError('A gallery runtime cannot resume another chapter.');
  const progress = checkpoint ? { ...checkpoint.progress } : initialProgress();
  const gallery = copyProgress(progress.gallery ?? initialGalleryProgress(seed));
  const base = createBaseRuntime(GALLERY_CHAPTER_ID, checkpoint?.pose ?? GALLERY_SPAWN, { ...progress, gallery }, session, false);
  return { ...base, gallery: initialGalleryTransient(gallery, String(base.session), checkpoint?.pose),
    doorExitOpen: gallery.finalDoorClosed ? 0 : 1 };
}
