# Goal 012 local scene QA

The MP4 files here were made from the actual `FirstPersonScreen` button tree, `runtimeController`, `TheatreScene`, authored world and Three resources using `scripts/preview-theatre-motion.cjs`. Native readiness and audio are stubbed; Three is rendered in a software WebGL browser with a CSS approximation of the HUD. The simulation advances at 60 Hz and videos sample frames at 10 fps. Each extraction stored source hashes and refused later capture if a source changed. Browser disposal reported zero remaining geometries and textures, one renderer and no WebGL console errors. These videos are continuous sampled playback, not iPhone captures, actual finger gestures, audible validation, FPS or perceptual proof.

| File | Length | What was exercised | Limit |
| --- | ---: | --- | --- |
| `light-operation.mp4` | 20 s | Real light handle drag, wrong release, explicit failed lock, correct release and accepted lock | No pre-migration video; pre/post numeric preservation is covered by domain tests only. |
| `bell-a.mp4` | 9 s | Bell A button, receiver at `(2.8, 2.68, 10.1)`, actor investigates that receiver | Actor is placed at a declared patrol comparison pose after route preparation. |
| `bell-b.mp4` | 9 s | Bell B button, receiver at `(-2.8, 2.68, 16.1)`, actor first hears it then can pursue when direct sight wins | Same controlled setup rule; not a natural full route. |
| `shutter.mp4` | 6 s | South handle, visible lowering, closed collider and recorded `lastSeen` at `(-3.4, 1.6, 10.88)` | No filmed far-side reopening or full detour. Controller tests verify both handles, LOS and collision. |
| `route-east.mp4` | 20.03 s | Light accepted, no bell/shutter, main passage and actual exit walk | Baseline path for comparison with the optional-device route. |
| `route-optional.mp4` | 23.37 s | Bell A, closed manual shutter, south return and east detour, curtain and actual exit walk | Uses subdued intensity; native direct-sight behavior under standard intensity needs device review. |
| `chapter-reentry.mp4` | 19 s | Actual App selection and preparation, Screen pause/home, gallery → vault → theatre → theatre reentry | Isolated in-memory storage and native-ready stubs; no cold device restart. |

The separate `preview-chapter-reentry.cjs` run uses actual App selection, preparation, Screen pause/home and new controller/scene ownership with isolated in-memory storage and native-ready stubs. Its filmed report recorded four scene owners and at most one active Canvas boundary. The extraction-only `--stress-ten` run added ten theatre reentries: 14 scene owners total, at most one active boundary, and zero after unmount. It does not measure native GL memory. In `--probe-visible` QA mode, the script temporarily exposes the hidden probe only inside the QA process, mounts App twice over the same isolated in-memory storage, and shows the saved open door on reentry. `probe-entry.png` and `probe-reentry.png` are two 390×844 extracted frames (frames 597 and 732), not a continuous probe video. The production catalog stays at four cards.

`route-matrix.json` records eight additional extraction-only controller/scene runs: no optional device, bell only, shutter only and both, each under standard and subdued intensity. All eight reached the actual exit walk once with the expected optional commands. These runs did not render browser frames or test a human escape response. Reproduce one with `--scenario=route-optional --optional-devices=shutter --intensity=standard --extract-only` and the two Japanese button labels shown below.

Local extraction and full-resolution frame data live in `.expo/goal012/` and can be removed with `rm -rf .expo/goal012`; this command is for generated QA output only, not checkpoints or source. Seven short MP4 files in this folder are the retained bounded artifacts. To reproduce a theatre clip, run the matching scenario with current UI labels, for example:

```sh
node scripts/preview-theatre-motion.cjs --scenario=bell-a --capture-fps=10 --commit-label='灯りを固定して扉を開く' --solved-leave-label='観察を終える' --out=.expo/goal012/bell-a
```

The 390×844 browser HUD is not native Yoga. Inspect real iPhone display, VoiceOver, fear response, audio and heat with the steps in `docs/IPHONE_VALIDATION.md` before treating them as verified.
