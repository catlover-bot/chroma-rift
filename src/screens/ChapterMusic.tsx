import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { createGalleryAudio, type AudioPreferences, type GalleryAudio, type MusicState } from '../audio';

/** Screen music shares the audio owner and preferences. It is unmounted
 * before the game's effect/music owner starts, so total ownership stays bounded. */
export function ChapterMusic({ state, preferences }: { state: Extract<MusicState, 'title_theme' | 'chapter_end'>; preferences?: AudioPreferences | undefined }) {
  const owner = useRef<GalleryAudio | null>(null);
  const preferencesRef = useRef(preferences);
  useEffect(() => { preferencesRef.current = preferences; owner.current?.updatePreferences(preferences); }, [preferences]);
  useEffect(() => {
    const session = `screen:${state}`, audio = createGalleryAudio({ sessionId: session, musicOnly: true,
      ...(preferencesRef.current ? { preferences: preferencesRef.current } : {}) });
    owner.current = audio;
    let mounted = true, active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let frame: number | undefined, last: number | undefined;
    const tick = (time: number) => {
      if (!mounted || !active) return;
      audio.setMusicState(state, session);
      audio.advanceMusic(last === undefined ? 0 : Math.max(0, Math.min(.05, (time - last) / 1000)), session);
      last = time; frame = requestAnimationFrame(tick);
    };
    audio.setActive(active);
    if (active) frame = requestAnimationFrame(tick);
    const sub = AppState.addEventListener('change', next => {
      active = next === 'active'; audio.setActive(active);
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined; last = undefined;
      if (active && mounted) frame = requestAnimationFrame(tick);
    });
    return () => { mounted = false; sub.remove(); if (frame !== undefined) cancelAnimationFrame(frame);
      audio.dispose(); if (owner.current === audio) owner.current = null; };
  }, [state]);
  return null;
}
