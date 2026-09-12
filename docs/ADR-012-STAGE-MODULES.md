# ADR 012: Static stage modules and instance rules

Status: accepted for Goal 012 v1.

The four existing chapters remain authored TypeScript modules. `src/domain/stageKit/definitions.ts` is the sole static content catalog for IDs, order, text, discovery IDs, content version, render kind and current save key. `modules.ts` explicitly imports each non-legacy chapter and binds its constructor, update, world, presentation, command and codec. The first-person host calls those bindings. The entrance stays on its existing validated compatibility path. This avoids runtime self-registration, dynamic code loading, new dependencies and a second renderer.

The module contract still adapts `ChapterRuntime`; the legacy optional fields are a migration debt. A future chapter should own its own state, codec and scene and add one typed binding. Once all controllers use stage-owned state and render bindings, `ChapterRuntime` can become a discriminated host handle and the old optional fields can be removed. V1 does not pretend this deletion is complete.

The one-axis drag rule handles acquisition, grab offset, bounded preview and pointer validation for theatre light and vault length. Their optical and length evaluators stay separate. The explicit action instance rule will handle independent bell cooldowns and a reversible shutter. Walk/look permission, pointer ownership and whether danger advances are distinct policy fields; those policies must be read by the real controller rather than inferred from a menu name.

Save formats stay chapter-local. Optional theatre environment devices are transient in v1: a cold resume starts with bells ready and shutter raised; pause/resume in one session retains cooldown and shutter state. No saved clearance gains a new requirement. This avoids altering the version-1 theatre document or its raw-backup behavior.

Simple modules now use a generic storage route with the existing serialized writer and run lease. Their own codec validates unknown raw documents, and their `canReplaceCheckpoint` rule prevents a module-specific progress rewind. A blocked document is kept byte-for-byte; explicit reset writes a backup before replacement. The four old namespaces retain their compatibility and migration rules. The App has a generic simple-stage fallback for selection, run, checkpoint and reset; a new puzzle style still needs its own renderer/content binding and may need chapter-specific presentation.
