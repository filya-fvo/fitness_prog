# APK26 parser fixture

Frozen from deployed revision `c399250`. Tests require no Git or device at runtime.

Only necessary historical declarations/seams are embedded; `.ts.txt` snapshots contain exact source excerpts with original line positions. `schemas.mjs` copies these schemas verbatim; only `mapProgram` TypeScript annotations are erased. It imports Zod, not current workout/offline schemas.

## Provenance

- `frontend/src/api/workouts.ts:16–47`; excerpt SHA256 `46b503d164fd5e4c461047e3f8713a74092084193824222fd2b56079981d20e9`.
- `frontend/src/api/workouts.ts:85–106`; excerpt SHA256 `34ae3f59b6e8a38d8d6a8e996c8a1e45195658e88083ed4b9cf1f76b6a268deb`.
- `frontend/src/api/workoutExecutionSchemas.ts:3–20`; excerpt SHA256 `22490a0885cb0df9f0587d4baa4aff5f28908abbb14282c4ebbb5cb77e3113e0`.
- `frontend/src/api/programs.ts:9–27`; excerpt SHA256 `87848d816b29c8615d4ba7d8dcb7036086bf64a8fb7e5ba5821aed0a125df571`.
- `frontend/src/api/programs.ts:34–54`; excerpt SHA256 `9e2debb2c8d3dde6783fe5d1a39d086b930eecf9ff6c9eec1979e037343bbd67`.
- `frontend/src/api/offlineWorkouts.ts:5–25`; excerpt SHA256 `45f027ae423300d734877c85ed74c1c56e33341c5ec0d3756d2e90e0fc57b447`.
- `frontend/src/db/offlineWorkoutContext.ts:35–39`; excerpt SHA256 `265afa35ac45301d3cfe13e1f14f9a866b9ba313a3a6d38faa820f6bfc0aced7`.
- `frontend/src/db/offlineWorkoutContext.ts:42–46`; excerpt SHA256 `6b24f3566ceaf03c53a092be293943c477fbc39c35ba5ab74fb45abd5e501922`.
- `frontend/src/db/offlineWorkoutContext.ts:76–76`; excerpt SHA256 `08c4c0738211a37ffa280a3a8197e46751d1076ee7bbbe7638992c3b16bdef78`.

## Execution and limits

The prepared schema includes every old nested method/group/part and both weight transforms. The full offline bundle parser includes program mapping, date-range superRefine, defaults, stamps, and limits.

`parseCachedPlans` retains the deployed relevant operations: `offlineWorkoutContextSchema.parse(input)`, per-plan `JSON.stringify(plan)` on save, and `preparedProgramPlanSchema.parse(JSON.parse(item.value))` on read. Owner checks/transactions/IndexedDB implementation are outside this parser fixture. Online mode uses the parsed bundle immediately.

`typed-bundle.json` is synthetic authoritative input with two typed targets, a superset and a drop method. `online-parsed.json` and `offline-parsed.json` are outputs captured by running `node parse.mjs online|offline` with that input. Frontend tests recompute and compare outputs; backend tests load them without requiring Node or installed frontend packages in the backend CI job. Backend tests supply a fresh canonical owner/date/version-bound fingerprint to the payload after reading the frozen parser output (the parser preserves the unchanged fingerprint).

No claim of native execution, new native target support, or database durability is made.
