import { runCli } from "./cli.js";

/***
 * Bootstrap status
 *
 * `@ankhorage/ankh` is the root CLI front door and command bus for Ankhorage.
 *
 * `ankh commands` discovers Ankh package metadata, attempts to load provider
 * manifests, and renders detailed command descriptors for providers that load
 * successfully.
 *
 * Doctor is registered as a core provider, so `ankh doctor ...` remains
 * available even when no repo-local provider package has been installed.
 *
 * No domain behavior belongs in the root CLI. Domain behavior stays in provider
 * packages such as infra, templates, studio, board, doctor, and dev.
 *
 * Current built-ins are `help`, `commands`, `plan`, and `version`.
 *
 * `ankh <category> --help` and `ankh <category> help` render provider-backed
 * category help when a valid provider manifest is available.
 *
 * `ankh <category> <command> ...args` performs basic direct dispatch to a
 * loaded provider handler. The root CLI stays a thin router: providers own
 * option parsing, validation, output, and behavior.
 *
 * `ankh plan <category> <command>` asks a provider planning handler for an
 * inspectable `AnkhCommandPlan` without executing provider command handlers.
 * Use `--json` for stable machine-readable output.
 *
 * Provider packages expose planning through optional `planningHandlers` on
 * their `AnkhRuntimeCommandProvider` default export. Planning is a provider
 * contract, not workflow execution: the root CLI routes to provider planning
 * handlers and renders returned plans, but it does not compose real workflows,
 * create projects, run commands, or execute destructive steps.
 *
 * `ankh run ...` remains deferred until explicit execution semantics are
 * designed.
 *
 * @usage
 */
await runCli(["--help"]);
