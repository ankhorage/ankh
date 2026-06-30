import { runCli } from './cli.js';

/***
 * Bootstrap status
 *
 * `@ankhorage/ankh` is the root CLI front door and command bus for Ankhorage.
 *
 * `ankh commands` currently lists discovered Ankh package metadata and
 * capabilities only.
 *
 * No domain behavior belongs in the root CLI. Domain behavior stays in provider
 * packages such as infra, templates, studio, board, doctor, and dev.
 *
 * Current built-ins are `help`, `commands`, and `version`.
 *
 * Provider manifest loading, command descriptors, category help, and command
 * execution are deferred beyond `ankhorage/ankh#2`.
 *
 * @usage
 */
await runCli(['--help']);
