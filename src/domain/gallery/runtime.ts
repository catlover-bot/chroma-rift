import { createInitialRuntime } from '../firstPerson/runtime';
import type { ChapterRuntime, CheckpointState } from '../firstPerson/types';
import { GALLERY_CHAPTER_ID } from './definition';
import { initialGalleryProgress, initialGalleryTransient } from './state';
export function createGalleryRuntime(checkpoint?: CheckpointState, session?: number, seed?: number): ChapterRuntime {
  if (checkpoint && checkpoint.chapterId !== GALLERY_CHAPTER_ID) throw new RangeError('A gallery runtime cannot resume another chapter.');
  const runtime = createInitialRuntime(checkpoint, session, GALLERY_CHAPTER_ID);
  if (!checkpoint && seed !== undefined) {
    const gallery = initialGalleryProgress(seed);
    return { ...runtime, progress: { ...runtime.progress, gallery }, gallery: initialGalleryTransient(gallery, String(runtime.session)) };
  }
  return runtime;
}
