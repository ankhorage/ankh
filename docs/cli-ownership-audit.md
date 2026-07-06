# CLI ownership audit

This document records the target ownership split for the historical `ankhorage4/packages/cli` package.

## Root command bus

`@ankhorage/ankh` owns only the command bus:

- built-in shell commands: `help`, `commands`, `plan`, `version`
- package metadata discovery
- package `./cli` export discovery
- provider command dispatch
- provider planning dispatch

Domain behavior belongs in provider packages.

## Historical command ownership

| Historical surface | Historical source | Target owner |
| --- | --- | --- |
| `ankh studio` | `packages/cli/src/index.ts` | `ankhorage/studio/src/cli/` |
| `ankh project:sync` | `packages/cli/src/index.ts` | `ankhorage/studio/src/cli/` |
| `ankh deps:prune` | `packages/cli/src/index.ts` | no target unless re-proven |
| `ankh modules:finalize` | `packages/cli/src/index.ts` | `ankhorage/orchestrator` for module execution, `ankhorage/studio` for host artifacts |
| `ankh infra:*` | `packages/cli/src/index.ts`, `infraCompat.ts` | `ankhorage/infra/src/cli/` |

## Historical route ownership

| Historical route group | Historical source | Target owner |
| --- | --- | --- |
| Project create/list/delete | `bridge/server.ts`, `ProjectManager` | `ankhorage/studio` |
| Template listing | `bridge/server.ts`, `templateRegistry` | `ankhorage/templates` |
| Studio manifest/runtime draft routes | `bridge/server.ts`, `ProjectManager` | `ankhorage/studio` |
| Project manifest routes | `bridge/server.ts`, `ProjectManager` | `ankhorage/studio` |
| Localization edit routes | `bridge/server.ts`, `ProjectManager` | `ankhorage/studio` until a localization package owns it |
| Infra project routes | `bridge/server.ts`, infra helpers | `ankhorage/infra`, called by Studio when project-scoped |
| Module routes | `bridge/server.ts`, `ModuleManager` | `ankhorage/orchestrator` for execution; `ankhorage/studio` for host state |

## Historical `orchestrator` folder audit

The folder name is historical and is not ownership.

| File or group | Responsibility | Target owner |
| --- | --- | --- |
| `projectManager.ts` | Project lifecycle and generated-app host state | `ankhorage/studio` |
| `projectStore.ts` | Project manifest storage | `ankhorage/studio` |
| `projectPaths.ts` | Project path helpers | `ankhorage/studio` |
| `projectDeletion.ts` | Project cleanup | `ankhorage/studio`, with infra calls delegated to infra |
| `scaffolder.ts` | Generated app scaffold creation | `ankhorage/templates` when reusable; otherwise `ankhorage/studio` |
| `templates.ts` | Generated app file templates | `ankhorage/templates` |
| `infraGenerator.ts` | Infra artifact generation | `ankhorage/infra` |
| `infraRuntime.ts` | Infra runtime lifecycle | `ankhorage/infra` |
| `infraValidation.ts` | Infra validation | `ankhorage/infra` |
| `moduleManager.ts` | Mixed host/module boundary | split between `ankhorage/orchestrator` and `ankhorage/studio` |
| `resolveMutations.ts` | Host layout mutation | `ankhorage/studio` or `ankhorage/expo-runtime` |
| `generatedRouteCleanup.ts` | Generated route file cleanup | `ankhorage/studio` or `ankhorage/expo-runtime` |
| `workspaceBundler.ts` | Workspace source copying and import rewriting | no target owner |
| `workspaceRuntime.ts` | Workspace install helper | no target owner unless package-specific ownership is proven |

## Other historical groups

| File group | Responsibility | Target owner |
| --- | --- | --- |
| `layout/*` | Expo Router layout generation | `ankhorage/expo-runtime` when generic; `ankhorage/studio` when Studio-specific |
| `manifestSystem/*` | Manifest defaults and system templates | `ankhorage/templates` or `ankhorage/studio` |
| `modules/catalog.ts` | Host module catalog and config glue | split between module packages and Studio host integration |
| `modules/runtime/LocalFsTargetAdapter.ts` | Local generated-app target adapter | `ankhorage/orchestrator` if generic; otherwise `ankhorage/studio` |
| `zoraExtensions/*` | Zora template extension registry | `ankhorage/templates` / `ankhorage/zora` integration |
| `utils/*` | Generic helpers | owning package that uses the helper |

## Required owning-package PRs

| Package | Required responsibility |
| --- | --- |
| `ankhorage/studio` | Studio command, project lifecycle, project API, manifest persistence, host sync. |
| `ankhorage/templates` | Template list/inspect/create provider surface and reusable generated app templates. |
| `ankhorage/infra` | Infra validate/generate/status/up/down provider surface. |
| `ankhorage/orchestrator` | True module lifecycle only. |
| `ankhorage/expo-runtime` | Generic Expo Router/runtime layout generation. |
| `ankhorage/data-sources` | Data-source commands when introduced. |
| `ankhorage/permissions` | Permission commands when introduced. |
| `ankhorage/paradox` | Documentation commands. |
