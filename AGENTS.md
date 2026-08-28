# AGENTS.md

## Scope

This file applies to the whole `ankhorage/ankh` repository.

`@ankhorage/ankh` is the Bun-first root CLI front door, provider registry, command router, and
command-bus bootstrap for Ankhorage. Keep the root CLI thin: domain behavior belongs in the package
that owns that domain.

## Repository facts

- Package name: `@ankhorage/ankh`.
- Runtime/tooling: Bun.
- Language: TypeScript, ESM, strict mode.
- Main source root: `src/`.
- Focused tests: `tests/`.
- Build output: `dist/`.
- Public entrypoints: `@ankhorage/ankh` and `@ankhorage/ankh/cli`.
- Executable: `ankh`.
- README and Paradox output are generated. Do not edit `README.md` or `paradox/` manually.

## Package responsibility

This package owns:

- root command parsing and dispatch;
- provider discovery, metadata loading, validation, registration, and selection;
- root help, command listing, version reporting, planning dispatch, and execution coordination;
- command context and interaction contracts required by the root CLI;
- the built-in Doctor provider registration needed for core repository diagnostics.

This package does not own:

- provider-specific option parsing, validation, output, or domain behavior;
- Studio generation and authoring behavior;
- Infra, deployment, templates, board, repository, or application-domain operations;
- Devtools policy, linting, formatting, Knip, workflow templates, or managed repository artifacts;
- workflow composition hidden behind the root CLI.

Provider-specific behavior stays in its owning package and is consumed through released public
entrypoints and declared dependencies.

## Root CLI and provider boundaries

- Keep `ankh` a thin router over provider contracts.
- Providers own their command handlers, planning handlers, arguments, validation, output, and side effects.
- Root planning only routes to provider planning handlers and renders the returned plan. It must not
  execute provider commands or silently turn planning into workflow execution.
- Do not introduce `ankh run` or another execution abstraction until its semantics are explicitly
  designed and tested.
- Preserve deterministic provider precedence. A valid repo-local provider may take precedence over
  a bundled/core provider only through the canonical discovery contract.
- Do not rely on ambient executables, `latest`, sibling source checkouts, workspace links, deep
  imports, or unpublished package output.
- Do not duplicate provider implementation in this repository to avoid an owner release.
- Keep provider-load failures isolated and diagnosable; one invalid optional provider must not hide
  valid commands from unrelated providers.
- Keep command output and JSON output stable when they are part of the documented CLI contract.

## Source and export rules

- Keep source under `src/` and build output under `dist/`.
- Keep public exports explicit in the intended root or `./cli` entrypoint.
- Treat every exported type, function, subpath, command, output shape, and exit behavior as an
  intentional public contract.
- Do not export internal discovery or dispatch helpers pre-emptively.
- Prefer one primary exported concept per module and name the file after that concept.
- Repository-local reusable utilities belong under `src/utils/<functionName>.ts` when needed.
- Cross-repository generic utilities belong in `@ankhorage/utility/<category>`; do not copy them locally.
- Asynchronous utility functions use the `Async` suffix; synchronous utilities do not use
  `Async` or `Sync`.

## TypeScript and implementation quality

- Preserve strict TypeScript.
- Do not introduce `any`, `as any`, `unknown as any`, `@ts-ignore`, or `@ts-expect-error`.
- Do not weaken lint, TypeScript, or module-resolution rules to land a change.
- Fix root causes instead of adding compatibility aliases, dual old/new paths, or historical fallbacks.
- Keep filesystem, process, and module-loading behavior explicit and testable.
- Keep tests deterministic and offline. Use fixtures for provider packages, manifests, workspaces,
  command contexts, and CLI output.
- Add regression coverage for provider precedence, invalid manifests, command dispatch, plans,
  exit behavior, and user-visible output whenever the affected contract changes.

## Devtools-managed repository policy

`@ankhorage/devtools` owns shared repository tooling and generated policy.

- Do not hand-edit generated ESLint, Prettier, Knip, workflow, editor, or package-script policy to
  bypass canonical Devtools behavior.
- Apply managed changes through the canonical selected Ankh CLI and released Devtools provider.
- Use the canonical `knip:check` package script name.
- Keep CI, release workflows, `packageManager`, Bun types, and generated policy synchronized with
  the released Devtools authority.
- Preserve repository-owned files and workflow behavior outside the Devtools-managed inventory.
- Treat `eslint.local.config.mjs` exceptions as existing debt: do not broaden them for unrelated
  work, and remove an exception when the touched code satisfies the canonical profile.
- Automatic synchronization must use the exact selected local/released Ankh and Devtools versions;
  never an ambient executable or an unpinned `latest`.

## Documentation

- README and Paradox artifacts are generated from source/configuration.
- Update `src/readme-usage.ts`, public declarations, documentation source, or Paradox configuration,
  then run `bun run docs`.
- Generated output must be deterministic and committed when the repository expects it.
- Do not document provider behavior as root CLI ownership.

## Dependencies and releases

- Declare every directly imported runtime dependency.
- Consume other Ankhorage packages through compatible released public APIs.
- Keep root dependencies minimal; domain packages own their own implementation dependencies.
- Add a changeset for published API, CLI behavior, command/output contract, dependency contract,
  or release-relevant documentation changes.
- Repository-instruction-only changes such as this file do not require a changeset.
- Use patch changesets for compatible fixes unless the change is clearly minor or major.

## Validation

Run the applicable full repository gates before handoff:

```bash
bun install --frozen-lockfile
bun run build
bun run lint:fix
bun run test
bun run knip:check
bun run typecheck
bun run format:check
bun run docs
bun run changeset:status
bunx @ankhorage/ankh doctor validate .
npm pack --dry-run
```

Also run `git diff --check` and inspect generated documentation changes when documentation is
affected. If a check cannot run or fails for a pre-existing reason, report that explicitly.

## Working style

Before changing code:

1. inspect the affected public entrypoint, provider boundary, tests, and documentation;
2. identify the canonical owner of every behavior;
3. determine whether a public contract and changeset are affected;
4. inspect current review comments, CI, and released dependency state.

While changing code:

1. keep the change focused;
2. update every affected consumer of the canonical contract directly;
3. avoid compatibility paths and duplicated owner logic;
4. update tests with behavior;
5. regenerate Devtools- or Paradox-owned artifacts through their canonical commands.

Before handoff:

1. summarize the behavior and files changed;
2. identify public API, CLI, dependency, and provider-boundary effects;
3. mention the changeset or why none is required;
4. report validation and release state accurately.
