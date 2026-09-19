# Goal015 Japanese display-name layout QA

**PASS: 36 rendered states, 48 UI PNGs, 1,434 measured text nodes and 702 button measurements. FINAL_SCREENSHOTS=PENDING.** These are actual component hosts translated to browser CSS, not iPhone/Simulator or App Store screenshots. Ending images contain spoilers and are for internal QA.

Run from the repository root:

```sh
node scripts/qa-goal015-brand-layout.cjs
```

The tool writes `.expo/goal015/brand-layout`. [report.json](report.json) retains every image hash, dimensions, scroll position, actual accessibility props, text/button metrics, asset alpha audit and input hashes. The successful [capture log](capture.log) and 49 PNGs (48 UI captures plus the iOS icon derivative) are retained here. Capture began from HEAD `0563e2d4bb76280fba2643078aa619e166bf8009` with the Goal015 display-name changes present; the report's 57 loaded-source and 12 additional input hashes identify the actual bytes and passed before/after verification. A base HEAD alone does not identify this candidate.

The production profile with `__DEV__=false` mounts the real Home, Settings and Ending components at each of 320×568, 390×844 and 430×932, font scales 1 and 2. Six states per size/scale are captured: home, settings, settings/about, settings/support closed, ending afterglow, and ending credits. Settings transitions call their actual button handlers. Credits are entered through the actual `onAccessibilityTap` handler and the actual `onShown` callback must fire once; no gameplay completion or saved-game progression is inferred from this component fixture.

All text passed the non-whitespace range bound check, every screen remained within its horizontal scroll width, and each button was individually scrolled into view and measured at least 44×44 CSS pixels, with at least 44 visible pixels vertically and contained text. Observed minimum button size was 66.016×50 pixels. Browser errors: 0. Numeric font sizes and authored line heights are scaled; default line height uses CSS `normal`. Vertical scrolling is expected for large text, so a viewport may end midway through the next paragraph; the content remains in the scroll view rather than being removed.

Selected images opened for visual inspection:

| View | Observation |
| --- | --- |
| [Home, 320/font2](home-320-font2-main.png) | `錯視館` fits on one line. The chapter title wraps onto two lines, keeping the hierarchy; description continues below the viewport. |
| [About, 320/font2](settings-about-320-font2-main.png) | `錯視館（さくしかん）` and version remain in the panel, wrapping at the narrow width. The about button wraps inside its border. |
| [Ending, 320/font2](ending-credits-320-font2-main.png) / [bottom](ending-credits-320-font2-bottom.png) | Name remains visible at the start; completion copy, attribution and action buttons continue vertically without horizontal clipping. |
| [Ending, 390/font1](ending-credits-390-font1-main.png) | Brand, chapter completion, attribution and all three actions fit within the viewport. Third-party attribution names and license text remain unchanged. |

Home and Ending brand `Text` hosts must expose `accessibilityLabel="さくしかん"` and `accessibilityLanguage="ja-JP"`; the visible name remains `錯視館`. About visibly includes both name and reading. Action labels are retained in the report. Support remains closed unless explicitly opened; no diagnostic record, old English brand or development-menu entry appeared in these normal views. These are property/callback assertions. Actual VoiceOver speech, rotor order, focus and gestures remain **PENDING** on an iPhone.

The CSS bridge uses local Noto Sans CJK JP rather than iOS system font metrics, zero simulated safe-area insets, approximate 51×31 switch tracks and an available-audio fixture. It does not measure native Yoga, native text rasterization, audio, touch delivery or the installed icon. Desktop scrollbar width is suppressed because iOS scroll indicators overlay content; scrollability remains enabled.

An initial noncanonical attempt used Chromium's classic 15px scrollbar, incorrectly narrowing a 320px screen's ending-credit text from 280 to 265px. Only the final fullwidth closing parenthesis of the unchanged attribution extended 5.063px beyond that narrower text box, into padding; horizontal viewport overflow was zero. A focused range inspection isolated that punctuation behavior. The new QA tool was corrected to use an overlay-width scroll indicator, then all 36 cases were rerun with unchanged product styles and the same strict text/button checks. The [initial log](history/classic-scrollbar-failure.log) and [initial script](history/initial-script.cjs.txt) preserve the failed attempt. It is not counted as a product defect or accepted canonical evidence.

The [branding assessment](../BRANDING-ASSESSMENT.md) distinguishes the opaque RGBA master from the checked RGB iOS derivative. No production image, font, gameplay rule, storage key or identifier was edited for this QA task. `node --check` and ESLint passed for the new tool.
