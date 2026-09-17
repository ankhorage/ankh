import { runCli } from './cli/index.js';

/***
 * Bootstrap status
 *
 * `@ankhorage/ankh` is the root CLI front door and command bus for Ankhorage.
 *
 * `ankh --help`, provider help, planning, and dispatch all resolve providers through the same
 * dynamic discovery path. Discovery combines providers installed alongside the running Ankh CLI
 * with the current package/workspace when present; a project-local package wins over an installed
 * package with the same package name.
 *
 * There are no hard-coded provider categories. A package becomes available through its `ankh`
 * package metadata and valid provider module, and root help lists only providers resolved by that
 * same invocation.
 *
 * No domain behavior belongs in the root CLI. Domain behavior stays in provider packages such as
 * infra, templates, studio, board, doctor, and devtools.
 *
 * Root built-ins are help, planning, and version output. `ankh commands` is not a separate
 * bootstrap command; the command overview belongs to root help.
 *
 * `ankh <category> --help` and `ankh <category> -h` render provider-backed package help using the
 * package description and complete command list without exposing capability or provider metadata.
 * Provider manifests also feed the shared provider-help renderer exported by `@ankhorage/ankh` so
 * standalone CLIs do not need a second hand-maintained command list.
 *
 * `ankh <category> <command> ...args` performs basic direct dispatch to a loaded provider handler.
 * The root CLI stays a thin router: providers own option parsing, validation, output, and behavior.
 *
 * `ankh plan <category> <command>` asks a provider planning handler for an inspectable
 * `AnkhCommandPlan` without executing provider command handlers. Use `--json` for stable
 * machine-readable output.
 *
 * Provider packages expose planning through optional `planningHandlers` on their
 * `AnkhRuntimeCommandProvider` default export. Planning is a provider contract, not workflow
 * execution: the root CLI routes to provider planning handlers and renders returned plans, but it
 * does not compose real workflows, create projects, run commands, or execute destructive steps.
 *
 * `ankh run ...` remains deferred until explicit execution semantics are designed.
 *
 * @usage
 */
await runCli(['--help']);
