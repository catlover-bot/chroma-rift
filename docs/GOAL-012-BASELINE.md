# Goal 012 baseline (2026-09-12)

- Original checkout: `/home/mhirotaka/workspace/chroma-rift`, branch `fix/goal-010-1-stage-boundaries`, HEAD `5c04d98`. Clean at start. Ancestors `aa8ff20`, `7be6d39`, `5e33c7c`, and `5c04d98` are present.
- The source tree is root-owned and not writable by the current user. Development uses the user-owned linked worktree `/home/mhirotaka/workspace/chroma-rift-goal012` on `feat/goal-012-stage-kit`; the original checkout remains untouched.
- Goal 011 mirror chapter is absent: no `mirror-corridor` implementation, catalog entry, world, save namespace, or tests were found. The existing four chapters are the migration set.
- Runtime: Node `v24.20.0`, npm `11.19.0`; `npm ls --depth=0` passed. Dependencies are shared read-only through a symlink to the original checkout's `node_modules`.
- Baseline `npm run test -- --silent`: 90 suites, 1,036 tests; 89 suites and 1,035 tests passed. `theatreRouteController.test.ts` failed in the `inspect=true decoy=false intensity=standard muted=true cold=false` route at the side inspection interaction. This happened in the original unmodified checkout. It requires isolation; it must not be counted as a Goal 012 regression or silently ignored.

## Existing chapter ownership

| Chapter | Definition and world | State and save codec | Rendering and controller | Existing tests |
| --- | --- | --- | --- | --- |
| Returnless entrance | `src/domain/firstPerson/legacyDefinition.ts`, `chapter.ts` | `runtime.ts`, `checkpoint.ts`, `src/storage/firstPersonStorage.ts` | `ChapterScene.tsx`, `runtimeController.ts` | `src/domain/firstPerson/__tests__`, native canvas tests |
| Perception gallery | `src/domain/gallery/definition.ts`, `world.ts` | `state.ts`, `checkpoint.ts`, gallery storage namespace | `GalleryScene.tsx`, `galleryController.ts` | gallery, screen, storage, route tests |
| Uncanny vault | `src/domain/vault/definition.ts`, `world.ts` | `state.ts`, `checkpoint.ts`, vault storage namespace | `VaultScene.tsx`, `vaultController.ts` | vault, screen, storage, route tests |
| Shadow theatre | `src/domain/theatre/definition.ts`, `world.ts` | `state.ts`, `checkpoint.ts`, theatre storage namespace | `TheatreScene.tsx`, `theatreController.ts` | theatre, screen, storage, route tests |

The stage selection is repeated in `src/app/stages.ts`, `src/domain/firstPerson/runtime.ts`, `chapter.ts`, `checkpoint.ts`, `src/rendering/firstPerson/runtimeController.ts`, `src/rendering/firstPerson/ChapterScene.tsx`, `src/rendering/firstPerson/resources.ts`, `src/screens/FirstPersonScreen.tsx`, and `src/storage/firstPersonStorage.ts`. This is the extension cost to reduce. The first-person `ChapterRuntime` and `PuzzleState` still carry optional gallery/vault/theatre fields. Gallery and entrance will remain compatibility adapters in v1; theatre and vault receive the deepest module binding.

The native GL context and renderer are owned by the existing canvas lifecycle; the controller advances simulation once, then the scene presents it. Stage Kit must not create another renderer or timer. Input ownership and release barriers live in `touchInput.ts` and the controller. Positional audio is presented after accepted controller events; domain noise drives AI independently of audio playback. Save namespaces, raw backups, serial writer, and session lease are in `firstPersonStorage.ts`. The repository already separates actor motion, occlusion, base runtime, boundary walls, and controller context. The theatre rail and vault length clasp duplicate one-axis grab, preview and commit rules; the projector crank and vault rod retain different evaluators and should not be flattened into that rule.

Protected file SHA-256 at start:

```text
7fac2bab3799f977a27195894dd1a1cab8addb93e0eda0584ad8aa0e43012296  package.json
559864399dab7b55cb7a01d9e22ea08630e7c389d61624a031ba56588b0e26ff  package-lock.json
a54fe526c605a25af69ff8f7dc2db43a25ab623004aa3119e74d7910b8837744  app.json
8964d8f8aa6ecdf34b6ed01683c2cf88b5fa7b0d80db16c9a9bdbc9e6e8153c0  eas.json
125af6c4ee15a27739bd4b982253d1859f7663f850f9795d3f7738ff1a243185  metro.config.js
8271006e52212447643256b750de9baa859e403c4f185220691a75a564db52ee  metro/withNativeThree.js
```
