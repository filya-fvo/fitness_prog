---
name: graphify
description: Query or rebuild the local Graphify code graph for Fitness Trainer architecture, dependencies, impact analysis, and cross-file relationships. Use when the user explicitly invokes $graphify or asks for a broad project map; do not use it as a substitute for verifying the source before edits.
---

# Graphify

Use the repository wrapper so Windows PATH and ExecutionPolicy differences do
not matter:

```powershell
.\scripts\graphify.cmd <arguments>
```

For an existing map, start with the smallest useful query:

- `query "<question>"` for architecture or dependency context;
- `path "<A>" "<B>"` for a relationship;
- `explain "<concept>"` for one symbol or subsystem;
- `affected "<symbol>"` before a cross-cutting change.

Read `graphify-out/GRAPH_REPORT.md` only for a broad overview. The graph is a
derived navigation index: confirm relevant behavior in current code and tests
before diagnosing or editing anything. `AGENTS.md`, executable code, tests, and
migrations retain their normal precedence.

Rebuild deterministically after structural code changes:

```powershell
.\scripts\graphify.cmd extract . --code-only --no-cluster --force
.\scripts\graphify.cmd cluster-only . --no-label
```

Do not enable semantic/cloud extraction, MCP, watch mode, strict mode, or git
hooks unless the user asks for that capability. Never use `--no-gitignore` in
this repository. Do not publish Graphify or its outputs to the production VPS;
it is a development-only tool.
