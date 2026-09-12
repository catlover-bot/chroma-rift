# Stage Kit 確認室

This is a development-only stage draft. It is not in the player's stage catalog.

Run its local test with `npx jest --runInBand --runTestsByPath src/domain/stages/stage-kit-probe/stage.test.ts`.

To promote it, finish its puzzle, world, checkpoint and scene; add one entry to `src/domain/stageKit/definitions.ts` (including target IDs and save key), one typed binding to `src/domain/stageKit/modules.ts`, and a render binding for the scene. Then run the validator and full checks. A draft is never silently exposed to players.
