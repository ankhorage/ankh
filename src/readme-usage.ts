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
 * `ankh <category> <command> ...args` now performs basic direct dispatch to a
 * loaded provider handler. The root CLI stays a thin router: providers own
 * option parsing, validation, output, and behavior.
 *
 * Planning/composition remains deferred until `ankhorage/ankh#3`.
 *
 * @usage
 */
await runCli(["--help"]);
