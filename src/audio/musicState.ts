import type { MusicState } from './types';

/** Actual game/actor state is supplied by the controller after accepted presentation. */
export type ChapterMusicContext = {
  surface: 'title' | 'game' | 'ending';
  suspended?: boolean;
  actorContained?: boolean;
  threat: 'none' | 'suspicion' | 'pursuit';
  safetyJustEarned?: boolean;
};
export function selectChapterMusicState(context: ChapterMusicContext): MusicState {
  if (context.suspended) return 'silent';
  if (context.surface === 'title') return 'title_theme';
  if (context.surface === 'ending') return 'chapter_end';
  if (context.safetyJustEarned) return 'release';
  if (context.actorContained) return 'exploration';
  return context.threat === 'none' ? 'exploration' : context.threat;
}
