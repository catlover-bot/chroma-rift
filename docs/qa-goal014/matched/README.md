# Matched scene states

The 19 `matched-*.png` images place baseline `3632675` on the left and the current authored scene on the right. Each pair uses the same recorded stage/runtime, player pose, 65-degree vertical FOV, 390×844 viewport, standard quality and standard horror setting. Baseline geometry comes from its retained actual scene export and recorded object updates. Current geometry comes from `ChapterScene`; area04 uses the actual planar mirror pass and same actor.

This is a static presentation comparison, not proof of identical gameplay input or a new full route. New transient clocks are explicitly set to their corresponding settled state. Movement, success timings and new console approach paths are evaluated separately in the actual App route and controlled input comparisons.

`manifest.json` retains exact imported source hashes and poses; `capture-result.json` retains browser/GL results and image hashes. The renderer also checked three additional new-console views, named `new-*`. Those views duplicated the current scene on both sides and are **not before/after comparisons**; their images are intentionally excluded from this published comparison set. Current console views are available in `../scene-hud/`.

Useful image pairs: `matched-594.png` (04 practice machine), `matched-633.png` (04 winch), `matched-680.png` (05 staff door and console from the old fixed pose), and `matched-739.png` (outdoor side). All published images were generated with Software WebGL, not iPhone hardware. No human continuous viewing or native GPU/FPS claim follows.

Reproduce with `node scripts/qa-goal014-matched-scenes.cjs`, retaining `.expo/goal014/before/app-scene-replay/` from the baseline capture. `published-files.json` records the exact delivered PNG bytes.
