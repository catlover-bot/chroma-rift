# Goal014.2 local evidence

`DEVICE_ACCEPTANCE=PENDING / RELEASE_READY=false`.

The [implementation report](../GOAL-014-2.md) distinguishes local facts, simulated measurements, known limitations and device work. Starting revision is `5bd34f26b65558e8da1cffd9d22ee93c0db78258`. Reports made before local commits identify exact executed files by their source hashes; their HEAD field alone does not describe the uncommitted candidate.

| Evidence | Location | What it proves |
| --- | --- | --- |
| Fresh baseline, protected hashes, environment | `baseline*.json`, `environment/` | Measured starting point; no historical test totals reused |
| P0 and held-input failures/fixes | top-level RED/GREEN records | Physical floor, dynamic-contact and pointer ownership reproductions |
| Actor/fairness history and final matrix | `actor-fairness/` |81 real-controller runs, reaction delays and the1.75-second loss boundary |
| Actual App/Screen routes | [screen-route](screen-route/README.md) | Rendered HUD callbacks through real input/controller/checkpoint/campaign; explicit native boundary fixture |
| Matched mechanism views | `mechanisms/` | Same legal camera/state normal/text-hidden comparisons on actual Three scenes |
| Common input before/after | `comparison/` | Same tape against baseline and candidate; offline audio trace mixes |
| Full candidate checks and export/source/asset guards | `final/` | Actual command outputs, source hashes, source-map checks, audio and r8 regression |

Original large intermediates remain under `.expo/goal014-2/`; selected generated images and videos are checked in. Gzip files decompress to the raw records; manifests give uncompressed/compressed hashes where applicable. Text copies may trim trailing whitespace only. No private user recording is included.

Reproduction commands use existing installed dependencies:

```sh
MIRROR_FAIRNESS_REPORT=.expo/goal014-2/fairness-rerun.json MIRROR_SCREEN_REPORT=.expo/goal014-2/screen-rerun.json npm run check
node scripts/check-runtime-cycles.cjs --report .expo/goal014-2/cycles-rerun.json
node scripts/validate-stage-definitions.cjs
node scripts/qa-goal014-2-screen-route.cjs --scenario=retreat --out=.expo/goal014-2/screen-rerun
node scripts/qa-chapter-audio.cjs --out=.expo/goal014-2/audio-rerun
node scripts/qa-native-default-framebuffer.cjs --out=.expo/goal014-2/r8-rerun --report=.expo/goal014-2/r8-rerun.json
```

The scripts' source/help defines additional arguments. Do not write rerun outputs over immutable canonical records. Software rendering, simulated presentation and offline mixing do not constitute iPhone input, rendering, listening, FPS/thermal, fear or first-time-understanding acceptance. See [iPhone validation](../IPHONE_VALIDATION.md) for the next preview check.
