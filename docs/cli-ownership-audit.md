# CLI ownership audit

This document records the target ownership split for the historical
`ankhorage4/packages/cli` package.

## Root command bus

`@ankhorage/ankh` owns only the command bus:

- built-in shell commands: `help`, `commands`, `plan`, `version`
- package metadata discovery
- package `./cli` export discovery
- provider command dispatch
- provider planning dispatch

Domain behavior belongs in provider packages.

## Historical command ownership

- `ankh studio`
  - Source: `packages/cli/src/index.ts`
  - Owner: `ankhorage/studio/src/cli/`
- `ankh project:sync`
  - Source: `packages/cli/src/index.ts`
  - Owner: `ankhorage/studio/src/cli/`
- `ankh deps:prune`
  - Source: `packages/cli/src/index.ts`
  - Owner: none unless re-proven
- `ankh modules:finalize`
  - Source: `packages/cli/src/index.ts`
  - Owner: `ankhorage/orchestrator` for module execution
  - Host artifacts: `ankhorage/studio`
- `ankh infra:*`
  - Source: `packages/cli/src/index.ts`, `infraCompat.ts`
  - Owner: `ankhorage/infra/src/cli/`

## Historical route ownership

- Project create/list/delete
  - Source: `bridge/server.ts`, `ProjectManager`
  - Owner: `ankhorage/studio`
- Template listing
  - Source: `bridge/server.ts`, `templateRegistry`
  - Owner: `ankhorage/templates`
- Studio manifest/runtime draft routes
  - Source: `bridge/server.ts`, `ProjectManager`
  - Owner: `ankhorage/studio`
- Project manifest routes
  - Source: `bridge/server.ts`, `ProjectManager`
  - Owner: `ankhorage/studio`
- Localization edit routes
  - Source: `bridge/server.ts`, `ProjectManager`
  - Owner: `ankhorage/studio` until a localization package owns it
- Infra project routes
  - Source: `bridge/server.ts`, infra helpers
  - Owner: `ankhorage/infra`, called by Studio when project-scoped
- Module routes
  - Source: `bridge/server.ts`, `ModuleManager`
  - Owner: `ankhorage/orchestrator` for execution
  - Host state: `ankhorage/studio`

## Historical `orchestrator` folder audit

The folder name is historical and is not ownership.

- `projectManager.ts`
  - Responsibility: project lifecycle and generated-app host state
  - Owner: `ankhorage/studio`
- `projectStore.ts`
  - Responsibility: project manifest storage
  - Owner: `ankhorage/studio`
- `projectPaths.ts`
  - Responsibility: project path helpers
  - Owner: `ankhorage/studio`
- `projectDeletion.ts`
  - Responsibility: project cleanup
  - Owner: `ankhorage/studio`, with infra calls delegated to infra
- `scaffolder.ts`
  - Responsibility: generated app scaffold creation
  - Owner: `ankhorage/templates` when reusable, otherwise `ankhorage/studio`
- `templates.ts`
  - Responsibility: generated app file templates
  - Owner: `ankhorage/templates`
- `infraGenerator.ts`
  - Responsibility: infra artifact generation
  - Owner: `ankhorage/infra`
- `infraRuntime.ts`
  - Responsibility: infra runtime lifecycle
  - Owner: `ankhorage/infra`
- `infraValidation.ts`
  - Responsibility: infra validation
  - Owner: `ankhorage/infra`
- `moduleManager.ts`
  - Responsibility: mixed host/module boundary
  - Owner: split between `ankhorage/orchestrator` and `ankhorage/studio`
- `resolveMutations.ts`
  - Responsibility: host layout mutation
  - Owner: `ankhorage/studio` or `ankhorage/expo-runtime`
- `generatedRouteCleanup.ts`
  - Responsibility: generated route file cleanup
  - Owner: `ankhorage/studio` or `ankhorage/expo-runtime`
- `workspaceBundler.ts`
  - Responsibility: workspace source copying and import rewriting
  - Owner: no target owner
- `workspaceRuntime.ts`
  - Responsibility: workspace install helper
  - Owner: none unless package-specific ownership is proven

## Other historical groups

- `layout/*`
  - Responsibility: Expo Router layout generation
  - Owner: `ankhorage/expo-runtime` when generic, `ankhorage/studio` when Studio-specific
- `manifestSystem/*`
  - Responsibility: manifest defaults and system templates
  - Owner: `ankhorage/templates` or `ankhorage/studio`
- `modules/catalog.ts`
  - Responsibility: host module catalog and config glue
  - Owner: split between module packages and Studio host integration
- `modules/runtime/LocalFsTargetAdapter.ts`
  - Responsibility: local generated-app target adapter
  - Owner: `ankhorage/orchestrator` if generic, otherwise `ankhorage/studio`
- `zoraExtensions/*`
  - Responsibility: Zora template extension registry
  - Owner: `ankhorage/templates` / `ankhorage/zora` integration
- `utils/*`
  - Responsibility: generic helpers
  - Owner: package that uses the helper

## Required owning-package PRs

- `ankhorage/studio`
  - Studio command, project lifecycle, project API, manifest persistence, host sync
- `ankhorage/templates`
  - Template list/inspect/create provider surface and reusable generated app templates
- `ankhorage/infra`
  - Infra validate/generate/status/up/down provider surface
- `ankhorage/orchestrator`
  - True module lifecycle only
- `ankhorage/expo-runtime`
  - Generic Expo Router/runtime layout generation
- `ankhorage/data-sources`
  - Data-source commands when introduced
- `ankhorage/permissions`
  - Permission commands when introduced
- `ankhorage/paradox`
  - Documentation commands
