# Goal014.2 — identical-input before / after

These paired scene movies run the **same literal controller tape** from the same validated checkpoint in baseline `5bd34f26b65558e8da1cffd9d22ee93c0db78258` and current source. Initial pose, 390×844 viewport, vertical FOV65°, standard quality and subdued intensity match. Controller successes, refusals, collision limits, actor trajectories and completion are retained without mid-run pose injection or adaptive navigation.

| Area | Paired picture, silent | Before with reconstructed sound | After with reconstructed sound | Frames / movie |
|---|---|---|---|---|
| 04 | [paired](area-04-paired-silent.mp4) | [before](area-04-before-sound.mp4) | [after](area-04-after-sound.mp4) | 166 / 33.2s |
| 05 | [paired](area-05-paired-silent.mp4) | [before](area-05-before-sound.mp4) | [after](area-05-after-sound.mp4) | 125 / 25.0s |

Both use 5fps sampling. The full operation tapes, exact samples, controller states, refusal messages, audio commands and source hashes are retained as gzip JSON. This is an isolated controller/ChapterScene comparison, not a native or App navigation recording.

Area04's baseline stops at **z23.745**, short of its visible door, and remains uncleared. The current controller walks to **z31.510833** and clears at the physical doorway. Sampled cameras match through frame143; from frame144 (28.806202s), the real floor-limit difference separates their positions, with no camera-angle difference. The final22 samples are therefore same-input outcomes, not equal-pose artwork comparisons. The isolated current harness retains area04 after completion and its final forward view is dark beyond the doorway; it does not mount area05. [Actual App/Screen recordings](../screen-route/README.md) separately prove the live handoff, area05 scene and save.

All125 sampled area05 player/camera poses match within1e−6. Actors simulate against each revision's real authored world, so their poses are not forced equal. The live reflection uses the same scene actor and actual `planarMirror.ts`; both revisions' mirror implementation hashes are equal and checked. Selected frames include [04 before camera divergence](area-04-frame-143.png), [04 first divergent sample](area-04-frame-144.png), and [05 outdoor state](area-05-frame-124.png).

Sound is reconstructed **separately for each revision** from that revision's actual audio-owner commands, default recorded volumes, literal source files and sample timestamps. Native loaded-player, zero-latency seek and successful-presentation boundaries are fixtures. The reconstruction uses PCM24 masters and one AAC encode for each cropped 390×844 movie; it applies no loudness normalization or synthetic repair. The output retains every video frame, padding audio to the final sampled video duration. It is not microphone/native audio capture or a listening-quality approval. [audio-video-report.json](audio-video-report.json) includes commands, frame alignment, probes, full decode checks and measurements; all4 movies have zero measured clipping, with maximum true peak −21.79dBTP.

Source and artifact integrity:

- Each of the four extractions checks142 loaded source files and28 audio assets against its own revision root. Baseline is a `git archive` outside the repository, so Jest cannot discover its tests. The source archive is not modified.
- Both revisions consume the exact same tape bytes: area04 SHA256 `794cce1de8abbbd5c28eb0484670206bfcb5f49a9d44ad8a141885e118c8b944`; area05 `2d4d7b4e46dbba835ce549a77f74448e894b8b890e826c3a51adfaf8f5082250`.
- Actual command/audio traces are guarded again after render and mix. Both audio pools finish with0 players. Browser checks report no GL errors,0 remaining geometries and the known one library-owned PBR DFG texture in the pre-renderer-disposal measurement.
- [manifest.json](manifest.json) hashes all retained files and exact uncompressed gzip bytes. [summary.json](summary.json) lists frame/source counts and final states; [comparison-report.json](comparison-report.json) preserves every measured camera difference and per-frame GL result.

Reproduce from the repository root:

```sh
node scripts/qa-goal014-common-tape.cjs setup
node scripts/qa-goal014-common-tape.cjs make
node scripts/qa-goal014-common-tape.cjs extract baseline 04 before
node scripts/qa-goal014-common-tape.cjs extract current 04 after
node scripts/qa-goal014-common-tape.cjs extract baseline 05 before
node scripts/qa-goal014-common-tape.cjs extract current 05 after
node scripts/qa-goal014-common-tape-capture.cjs
```

`GOAL014_COMPARISON_DIR` overrides the default `.expo/goal014-2/comparison`; `GOAL014_COMPARISON_REVISION` explicitly selects an alternative baseline. The exact local audio authoring runner is retained as [mix-and-mux.py.txt](authoring/mix-and-mux.py.txt), with its recorded command lines and source roots in the audio report. Large raw scenes, all PNG frames and PCM masters remain in `.expo/goal014-2/comparison/`. This local evidence does not certify native rendering, device timing, acoustic playback, accessibility or a new player's understanding; `RELEASE_READY=false` remains appropriate.
