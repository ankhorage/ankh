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
 * `ankh run ...` remains deferred until explicit execution semantics are
 * designed.
 *
 * @usage
 */
await runCli(["--help"]);
