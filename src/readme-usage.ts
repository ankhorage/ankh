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
 * Current built-ins are `help`, `commands`, and `version`.
 *
 * `ankh <category> --help` and `ankh <category> help` render provider-backed
 * category help when a valid provider manifest is available.
 *
 * Provider command execution remains deferred until `ankhorage/ankh#6`.
 *
 * @usage
 */
await runCli(["--help"]);
