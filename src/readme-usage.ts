import { runCli } from "./cli.js";

/***
 * Bootstrap status
 *
 * `@ankhorage/ankh` is the root CLI front door and command bus for Ankhorage.
 *
 * Provider discovery is intentionally deferred to `ankhorage/ankh#2`.
 *
 * No domain behavior belongs in the root CLI. Domain behavior stays in provider
 * packages such as infra, templates, studio, board, doctor, and dev.
 *
 * Current built-ins are `help`, `commands`, and `version`.
 *
 * @usage
 */
await runCli(["--help"]);
