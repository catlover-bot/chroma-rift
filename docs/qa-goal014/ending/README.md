# Ending and transition layout

`report.json` records 21 layout cases and 33 screenshots: ending intro and credits with/without the optional procedure record, plus the three actual App transition beats, at 320×568, 390×844 and 430×932. Font scale reaches 2. The real React Native component tree is rendered through the documented browser CSS adapter; text/button bounds and scrolling are checked. This is not native Yoga, VoiceOver or device acceptance.

Intro/credit clocks, fresh-press skipping, pause/background behavior, immediate completed save and the four-second playable outdoor aftermath are covered by actual component/controller regressions in the full check. The screenshots alone do not demonstrate timing or persistence.

The published sound video may append `intro-390-normal-top.png` for twelve seconds and `ending-390-normal-top.png` for four seconds. That tail is a constructed UI illustration with the real ending music; it is explicitly separate from the sampled five-area scene replay and is not presented as native screen recording.

Reproduce with `node scripts/qa-chapter-ending-layout.cjs`. The story host source hashes are retained alongside direct component hashes. `published-files.json` identifies every screenshot. No participant evaluation or human listening was performed.
