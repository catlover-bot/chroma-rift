# Goal014.2 — actual App / Screen 04 → 05

Three uninterrupted input routes reach the visible area04 doorway and let the actual App save and enter area05. Every movie shows the actual Screen HUD hosts over the actual Three scene. Movies are **silent**; the report records actual audio-owner/native-fixture status, not recorded sound.

| Route | Simulated time | Movie | Frames | Screen input deliveries |
|---|---:|---:|---:|---:|
| [Straight work and escape](straight/screen-route.mp4) | 30.449945 s | 30.5 s | 305 | 96 |
| [One tooth, cue, retreat, rework](retreat/screen-route.mp4) | 49.083130 s | 49.1 s | 491 | 137 |
| [Capture, presented recovery, rework](capture/screen-route.mp4) | 44.266611 s | 44.3 s | 443 | 131 |

All use standard intensity/quality, a 390×844 portrait viewport, font scale 1, vertical FOV 65°, simulated 60Hz updates and 10fps sampling. The H.264 files are 390×892 because a 48px QA caption sits below the gameplay viewport. The final sampled frame accounts for less than 0.1s of rounding; there are no omitted route segments or time compression.

The start is an explicitly authored, codec-valid **unsolved area04 cold campaign entry**, with areas01–03 already completed. The route acquires the key and practice result through Screen actions. It does not inject a pose, actor state, tooth, gate state or completion during play. `mirrorPointerRoute.ts` delivers actual movement/look/hold handlers. The host renderer does not provide native bubbling, so the same end/cancel event is explicitly delivered to the stable scene ancestor. `FirstPersonScreen.publish → App.onComplete` performs the transition; no completion callback is invoked by the tool.

Evidence in [summary.json](summary.json), the compressed full reports and each `save-proof.json` includes input batches, actor/body positions, physical pose checks, retained pointers, tooth/gate progress, event times, actual campaign identity/key carry and memory-storage writes. The original input and final campaign JSON preserve the same run ID; the final area is `chapter-1-area-05`.

The final whole-check also passed the [seven-case Screen integration matrix](screen-matrix.json.gz): standard straight at60Hz, subdued straight at30Hz, one-tooth cue retreat at60Hz, retained-left-pointer retreat at30Hz, capture/recovery at60Hz, actual post-gate capture/recovery at30Hz, and pause/background lifecycle at60Hz. These are additional actual App/Screen/controller/save tests with the native GPU boundary substituted; only the three routes in the table have movies here.

- The retreat route first records a nearby actor foot plant at 10.749945s, releases at 11.999945s (1.25s later), moves at 12.033278s, and reaches cover at 13.283278s. This is a scripted response to a real controller cue, not a human reaction-time measurement.
- The capture route deliberately leaves cover. Capture and its first successful-presentation fixture occur at 23.266611s; input is available at 24.466611s, exactly 1.2s later. Key, practice and the first tooth remain. The recovery view shows a sheltered corner and part of its floor opening; it is not an unobstructed doorway view. See [during recovery](capture/frame-0235.png) and [input available](capture/frame-0245.png).
- All routes automatically release work after the third tooth, physically cross the grate and z31.5 doorway threshold, retire the old controller, and show the [actual area05 scene](straight/frame-0304.png). One Canvas owner is live at a time; final Canvas/audio/player/session/callback owners are zero. The native-fixture pool stays at or below 12 players.

The accepted native presentation, Canvas readiness, memory AsyncStorage, native metadata and shared audio-status backend are explicit fixtures. The movie replays Three transforms and the real planar-mirror implementation in SwiftShader, with actual HUD styles translated to CSS. It does not certify EXGL/R3F scheduling, Yoga/text metrics, native gesture delivery, physical-device frame rate, accessibility behavior, listening, or a new player's understanding. The direct drag/waypoint authoring is not a human motor-control recording.

Reproduce from the repository root:

```sh
node scripts/qa-goal014-2-screen-route.cjs --scenario=straight --out=.expo/goal014-2/screen-route/straight
node scripts/qa-goal014-2-screen-route.cjs --scenario=retreat --out=.expo/goal014-2/screen-route/retreat
node scripts/qa-goal014-2-screen-route.cjs --scenario=capture --out=.expo/goal014-2/screen-route/capture
```

`--extract-only` performs the App/Screen/controller/save checks without browser rendering. [manifest.json](manifest.json) hashes the retained artifacts and the exact decompressed bytes of gzip files; [summary.json](summary.json) records source/asset/tool guards and video probes. All three cases load identical guarded source and asset bytes. Large raw scene JSON and complete PNG sequences remain in `.expo/goal014-2/screen-route/`; the saved animation, selected PNGs, reports, save proofs, logs and videos are retained here.
