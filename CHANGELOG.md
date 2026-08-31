# Changelog

## 0.8.5

### Patch Changes

- 78e2f08: Update the Devtools toolchain and align Doctor with the current managed repository policy.

## 0.8.4

### Patch Changes

- f011309: Update Ankhorage dependencies: `@ankhorage/devtools`.

## 0.8.3

### Patch Changes

- 3a4444d: Update Ankhorage dependencies: `@ankhorage/doctor`, `@ankhorage/paradox`.

## 0.8.2

### Patch Changes

- 3a8b498: Update Ankhorage dependencies and synchronize the Bun 1.3.14 / Node 24 Devtools tooling baseline.

## 0.8.1

### Patch Changes

- b0691cf: Update the bundled Doctor core provider so native OAuth callback schemes and development-build readiness are available through the root CLI.

## 0.8.0

### Minor Changes

- 17d9523: Support explicit category-root provider commands in dispatch, planning and help, and expose a host-owned injectable confirmation interaction for safe interactive and non-interactive providers.

## 0.7.10

### Patch Changes

- bc79c25: Update the bundled Doctor core provider to expose target- and environment-aware OAuth readiness through the root CLI.

## 0.7.9

### Patch Changes

- e3eb3f8: update DEVTOOLS

## 0.7.8

### Patch Changes

- 1446ee7: update DEVTOOLS

## 0.7.7

### Patch Changes

- update DEVTOOLS

## 0.7.6

### Patch Changes

- bd3715e: update DOCTOR

## 0.7.5

### Patch Changes

- f934d68: ankh devtools sync

## 0.7.4

### Patch Changes

- 42205fc: update DEVTOOLS

## 0.7.3

### Patch Changes

- 454df05: Relax repository-local ESLint size and complexity limits to the current codebase maxima and replace dynamic indexing patterns that triggered shared security lint warnings.

## 0.7.2

### Patch Changes

- 9a0f7f6: update DEVTOOLS

## 0.7.1

### Patch Changes

- Update DOCTOR

## 0.7.0

### Minor Changes

- f05ddff: Bundle `@ankhorage/devtools` as a core provider so globally installed Ankh CLIs expose the `ankh devtools ...` command namespace. Installed Ankhorage package discovery now also supports symlinked package directories.

## 0.6.7

### Patch Changes

- d0de599: update DEVTOOLS

## 0.6.6

### Patch Changes

- 7501238: Keep internal CLI imports under `src/cli/` so package layout validation passes without breaking builds or tests.

## 0.6.5

### Patch Changes

- 21b157c: Register `@ankhorage/doctor` as an always-available core provider while allowing a locally discovered Doctor package to override the bundled instance during development.

## 0.6.4

### Patch Changes

- 9cac235: Document the package command ownership map.

## 0.6.3

### Patch Changes

- 7707bc8: Expose the root CLI from the package CLI folder and discover provider modules from package CLI exports.

## 0.6.2

### Patch Changes

- 2ee5d9a: Route legacy compatibility command names to provider-backed command paths.

## 0.6.1

### Patch Changes

- 3c2284c: Release trigger

## 0.6.0

### Minor Changes

- 1d71ed8: Promote command planning handler types as a public provider contract.

## 0.5.0

### Minor Changes

- 283dd45: Add inspectable provider command planning infrastructure for `ankh plan` with deterministic human and JSON output.

## 0.4.0

### Minor Changes

- 787557b: Add local provider execution contracts and direct provider command dispatch.

## 0.3.1

### Patch Changes

- d0f9565: Load provider manifests for detailed `ankh commands` output and provider-backed category help.

## 0.3.0

### Minor Changes

- 8d8734c: Add metadata-only Ankh package discovery for `ankh commands`.

## 0.2.1

### Patch Changes

- 1fb5302: Trigger release

## 0.2.0

### Minor Changes

- 039fc1d: Bootstrap the Bun-first Ankh CLI front door with a native parser and empty provider registry.

All notable changes to this project will be documented in this file.
