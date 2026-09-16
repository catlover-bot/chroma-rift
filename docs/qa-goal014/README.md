# Goal014 local evidence

Worktree: `/home/mhirotaka/workspace/chroma-rift-goal012`; branch: `feat/goal-014-chapter-one-polish`; starting commit: `3632675e5c42ac252cca433a5e6dd45bb028f8c5`. The r8 framebuffer correction and its failure history remain in this branch. The product marker is `goal-014-polish-r1`.

**Local implementation and verification are complete. DEVICE_ACCEPTANCE=PENDING / RELEASE_READY=false.** The final check runs against committed implementation `f20801e`; the following documentation commit does not change those tested sources. Historical captures retain their original HEADs and exact source hashes; [post-capture commit correspondence](local-artifact-source-correspondence.json) verifies their actual inputs against committed Git blobs.

## Watch and compare

| Evidence | What it proves and where it stops |
|---|---|
| [Before with audio](video/chapter-one-before-with-audio.mp4), [after with audio](video/chapter-one-after-with-audio.mp4) | Real five-area App/controller routes, sampled scene replay at 5 fps, actual audio-owner command traces reconstructed offline. Before 148.004 s; after 155.8 s gameplay replay + 12 s intro still + 4 s credit still = 171.8 s. The UI tail uses actual component screenshots and prepared ending music. These are not native recordings or identical-input routes. |
| [19 matched scene pairs](matched/README.md) | Identical baseline state, camera, FOV, quality and horror setting. Left baseline, right current scene. Settled transient animation fields are explicitly supplied. This is static visual comparison, not a controller playthrough. |
| [04/05 identical-input comparison](comparison/README.md) | Two literal controller tapes, both revisions, explicit compatible checkpoint start, the same camera/FOV/standard quality/subdued setting; refusals retained. Side-by-side silent clips plus four separate sound clips preserve each soundtrack. All 143 sampled 04 cameras match; 05 cameras diverge only when the baseline freezes after completion and the new version still permits walking. A separate equal-actor-pose mirror fixture proves visible reflected body pixels. |
| [Actor turntables and motion](actor/README.md) | Same 408 actor states at both quality levels, shared root/eyes/feet, baseline/current bodies, fixed camera and lighting. Human animation/art acceptance remains pending. |
| [Scene/HUD and Japanese signs](scene-hud/README.md) | Five areas, mechanism states, standard/low quality, 320/390/430 sizes and enlarged text. Browser CSS approximates the real React Native tree; native Yoga/VoiceOver remain unverified. |
| [Ending and transition layouts](ending/README.md) | 21 cases and 33 images with actual intro/credit components and three App story beats. Timing and persistence are tested separately. |
| [Music and mixed audio](../AUDIO-DIRECTION.md) | Six actual compositions, fifteen physical/environment clips, source/licence/hash records, per-file and mix analysis, replay-owner lifecycle. No human listening is claimed. |

After-video navigation: 04 key removal **116.2 s**, first ratchet **126.8 s**, third ratchet **130.8 s**, passage completed **138.4 s**; 05 key **138.8 s**, procedure **139.0 s**, isolation **144.6 s**, stop **144.8 s**, physical outdoor crossing/immediate save **151.4 s**, ending intro illustration **155.8 s**, credits illustration **167.8 s**. Interaction evidence frames occupy 0.2 s without adding simulation time; the audio frame map accounts for these repeated simulation timestamps. See [exact media inputs, hashes and full decode checks](video/media.json).

The natural routes adapt their walking/aiming to the changed console layout and the newly playable outdoor aftermath. They must not be described as the same input sequence. The controlled comparison evidence is separate. In that tape, the independently simulated current actor takes a different trajectory and does not contribute visible mirror pixels at the sampled times; an offscreen draw alone is not called proof of actor visibility. The separate same-actor-state visual fixture finds 3,044 baseline / 2,465 current reflected pixels, with the actual mirror and no GL errors. It is explicitly a frozen visual comparison, not a gameplay moment or substitute actor. No native failure was concealed.

## Checks and measured limits

| Check | Result and source |
|---|---|
| Fresh pre-edit baseline | 113 suites / 1,190 tests, lint/type/iOS export PASS; [baseline record](baseline.json). The original temporary raw log is unavailable; its recorded hash/result are preserved. |
| Final full check r4 | **126 suites / 1,286 tests PASS**, 275.805 s Jest, lint/type/iOS export PASS, 1,612 modules. All 514 non-document inputs unchanged during the run and match commit `f20801e`. [Record](validation/final-check-r4.json), [compressed raw log](validation/final-check-r4.log.gz). The earlier r2 pass (1,284 tests) remains recorded before the two enlarged-label regressions. |
| Four real Metro exports | Preview Hermes, preview release JavaScript, production JavaScript and development JavaScript pass. 219 mapped first-party sources for release; 239 for development; single Three identity and exact 21 new audio asset bytes. [Bundle guards and inspectors](bundles.json). |
| Runtime cycles | 247 production modules / 742 edges; zero cycles and errors on iOS, Android and neutral. [Full scanner record](runtime-cycles.json). |
| Stage/sign/scene verification | Existing stage validator and generated-sign byte check pass. Ending layout, matched scene rendering and framebuffer regression pass. [Scene commands and compressed logs](validation/scene-checks.json). |
| r8 framebuffer | Actual adapter, observer, mirror and authored current 04 scene in Chromium WebGL2/SwiftShader; intentional invalid BACK control and corrected default/reflection behavior remain distinct. [Report](native-framebuffer.json). This is not Expo/iPhone GL scheduling. |
| Dependencies | `npm ls` PASS; Doctor **20/21**, Expo check nonzero only for installed 57.0.22 versus recommended ~57.0.23. Audit **11 moderate, 0 high, 0 critical**. Fresh raw outputs and exit codes are in `validation/environment-*.json` and corresponding compressed logs. No dependency updates or exclusions. |
| Assets | [Manifest](asset-manifest.json) identifies real imported audio, authored geometry/textures/signs, licensed sources and separate disk/CPU/GPU estimates. Six protected config/dependency files retain baseline bytes. |
| Puzzle and save invariants | [Git-object audit](validation/invariant-audit.json) confirms unchanged 01–03 domain, illusion, actorMotion, firstPerson, campaign, storage and stimulus-source objects. Intentional 04/05 layout/LOS/animation and accessibility changes are listed separately. Source equality does not replace human perceptual acceptance. |

The final full App replay has 779 frames, 43 offline scene rebuilds and one maximum active App Canvas boundary. Main/reflection/total maximum calls are **150 / 58 / 150**; maximum triangles **29,162 / 4,636 / 29,510**. These are separate maxima; total counts sum the actual passes in each frame. Eighteen frames perform reflection at 384×384. No extra shadow pass is introduced. GL errors are zero.

[Failed/interrupted attempts and fixes](validation/failure-history.json) retain the pre-final 124-suite run with two presentation-fixture failures, the mistyped focused-test path, the enlarged-label regression, and the r3 run intentionally stopped after discovering archived baseline tests. The [test discovery guard](validation/test-discovery.json) subsequently verifies exactly 126 product suites and no archived tests. No assertion was removed, test skipped, puzzle tolerance enlarged or product path excluded to obtain a passing result.

Browser CPU render-submit p50/p95/max: **0.7/82.2/264.9 ms**. Warm-frame subset: **0.7/1.8/184.3 ms**; 43 remount frames: **104.3/222.2/264.9 ms**. Offline fetch/JSON/ObjectLoader scene-load p50/p95/max: **317.8/479.8/521.8 ms**. These capture-path rebuilds do not represent normal native per-frame scene work. They exclude screenshot/readback, native presentation and GPU completion and cannot establish iPhone FPS, upload cost or heat. [Per-frame measurements](video/after-render-frame-metrics.json) and [replay report](video/after-video-report.json) preserve their scopes. After the text-layout fix, the fresh replay produced [the same silent video bytes](video/replay-r3-correspondence.json); original and new report identities remain separate.

After scene disposal, geometry returns to zero. One renderer-owned 16×16 PBR DFG texture remains (1 KiB); it is distinct from scene asset leaks. New standard surface/sign texture estimates are approximately 14.04 MiB in the conservative all-signs inventory; actor typed geometry buffers are 468,752/176,296 bytes at standard/low. New prepared audio totals 8,430,865 bytes; QA media are not shipped as app assets. Baseline and after renderer/resource reports are both retained.

## Observation and acceptance boundaries

| Evidence class | Status |
|---|---|
| Real domain/controller, App flow, saves, actual scene resources | Executed locally, with source identities and test assertions. In-memory AsyncStorage and native Canvas readiness/audio substitutes are declared where used. |
| Browser Software WebGL and CSS | Generated and decoded videos; selected full-resolution images inspected. Approximate HUD layout and offline audio reconstruction, not native output. |
| iPhone/preview/native touch and sound | **PENDING**: new assets, mirrors, retry, cold resume, VoiceOver, device volume, headphone/speaker/mono, sustained performance and thermal checks. |
| Human continuous viewing/listening, first-time comprehension and artistic response | **PENDING**. No invented participants, usability scores, perceptual/fear ratings or listening claims. |

The user-supplied r8/build3 recording remains evidence of its observed 04→ending route only. It is not evidence that this new content has run on a device. The [completion audit](completion-audit.md), [implementation record](../GOAL-014.md), [gimmick table](../GIMMICK-CLARITY.md), [art record](../ART-DIRECTION.md), [attribution](../ASSET-ATTRIBUTION.md) and [iPhone steps](../IPHONE_VALIDATION.md) preserve the full scope.

The existing preview profile uses internal distribution, `developmentClient:false`, `autoIncrement:true` and remote app-version management. The user builds a new embedded preview with `cd /home/mhirotaka/workspace/chroma-rift-goal012 && npx eas-cli@latest build --platform ios --profile preview`. Codex has not executed that command. Reloading Metro does not update an embedded preview. No push, PR, signing, authentication or publication occurred.
