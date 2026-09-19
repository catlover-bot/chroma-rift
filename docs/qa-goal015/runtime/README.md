# Goal015 completed runtime evidence

This package retains completed non-Jest checks from `.expo/goal015/final`. [summary.json](summary.json) records exact counts, command exit codes, boundaries, source verification and every original/packaged artifact hash. It does not include the separately running full `npm run check`, its Jest-generated fairness/routes, or a signed iOS build.

| Check | Recorded result | Scope |
| --- | --- | --- |
| [Dependency cycles](cycles.json.gz) / [log](cycles.txt) | iOS, Android and neutral each: 254 production modules, 776 runtime edges, 0 strongly connected components and 0 errors. App/direct-entry cycles also 0. | Static potential runtime graph after type erasure; external packages/assets are boundaries. No native startup. |
| [Framebuffer regression](native-framebuffer.json.gz) / [log](native-framebuffer.txt) | 19 cases; all 14 checks true; 10 fresh entries; 0 browser exceptions. True front renders the reflection, true back skips it; owner teardown matches baseline. | Real Chromium WebGL2/ANGLE SwiftShader, fixture FBO and one fixture presentation. Actual area04 scene, current adapter/mirror/GL observer and installed Three. No iPhone GPU, native Canvas scheduling or `endFrameEXP` acceptance. |
| [Audio/controller recording](audio/recording.json.gz) / [log](audio.txt) | All 5 route areas cleared; campaign completed. Route: 155.117 simulated seconds, 5,997 events, maximum 12 players, 0 active at end. Audition: 111 seconds/636 events, maximum 12 players; ending excerpt: 16 seconds/8 events, maximum 1 player; both end at 0. | Real controllers, owner and post-presentation hooks with simulated accepted presentation and loaded zero-latency player fixtures. Audition/ending are explicit owner sequences, not actual React/native lifecycle captures. No audible playback or artistic listening verified. |
| [Metro commands](metro/results.json) | 8 commands, all exit code 0. Development/release source maps match 246/226 current first-party sources. Each uses one Three source and records the same class identity. | Actual local Metro exports and emitted-source/identity inspection; exported bundles/maps remain local and are not copied here. |
| [Development entry inspection](metro/development-entry.txt.gz) | 6/6 observations passed; 1,769 registered modules; 246 source correspondences; no missing roots or first-party cycles. | Actual emitted loader/prelude/first-party factories in isolated Node VM registries. One explicit empty `expo-constants` cache fixture; no React Native App mount, device audio or GL startup. |
| [Release export inspection](metro/production-release.txt) | 1,626 sources and 31 assets; 5 campaign areas present; development screens, probe and dev-client JS absent. | The directory called `production` is a Metro release-mode export. Its retained commands do not record an explicit `EXPO_PUBLIC_CHROMA_BUILD_PROFILE=production` environment. The parent's separate explicit-profile export is outside this package. |

The framebuffer report retains its historical tool label `GOAL_013_1_R8_REGRESSION_B`; its timestamp, Goal015 run directory and exact source hashes identify this current run. The report distinguishes one renderer-owned Three PBR DFG lookup texture (16×16 RG half float, 1,024 bytes) from scene resources. Scene disposal measurements of 0 geometries/1 texture do not claim that a post-renderer-disposal texture measurement was taken.

Packaging independently rehashed **289 unique source, tool, asset and installed-Three files** across these reports; all matched current bytes. All 28 recorded audio assets matched. Both retained Metro bundle hashes and the locally retained framebuffer scene payload hash also matched. The [combined source-hash record](verified-source-hashes.json.gz) and per-check counts in `summary.json` make these checks explicit. Reports start from baseline HEAD `0563e2d4bb76280fba2643078aa619e166bf8009`; executed Goal015 working bytes are identified by their hashes, rather than that baseline commit alone.

Files at least 16 KiB are compressed with gzip level 9 and `mtime=0`. Every decompressed file was checked byte-for-byte against its original, repeated compression produced identical bytes, and originals were rechecked unchanged after packaging. Raw and gzip hashes/lengths are in `summary.json`. For example:

```sh
gzip -dc docs/qa-goal015/runtime/native-framebuffer.json.gz
```

No giant bundle, source map, `node_modules` directory, GL scene JSON, screenshot or generated audio file is republished here. Logs/report data are evidence of the stated software checks; **production device acceptance remains PENDING and release readiness remains false**. No production source or active full-check log was changed by packaging.
