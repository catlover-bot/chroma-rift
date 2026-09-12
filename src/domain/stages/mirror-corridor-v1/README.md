# 鏡越しの回廊

This is a registered but hidden area-04 work in progress. `playerVisible:false` is intentional. It is not a finished campaign area or a player stage card.

Run its local test with `npx jest --runInBand --runTestsByPath src/domain/stages/mirror-corridor-v1/stage.test.ts`.

The current domain implements an explicit central key, safe practice, three retained ratchet teeth, a world gate and a cold checkpoint. A fixed original two-profile shape is drawn in the scene. It does **not** yet implement a real reflection pass, a live patrolling actor, domain noise, actual press-and-hold input/release, safe capture recovery or an integrated campaign route. The dark pane is marked unfinished in code and cannot be accepted as the required mirror. Finish those behaviors and real controller/scene QA before exposing this stage or marking content complete. The static Stage Kit definition, module and render binding are already registered for validation.
