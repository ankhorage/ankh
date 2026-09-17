import { runCli } from './cli/index.js';

/***
 * Bootstrap status
 *
 * `@ankhorage/ankh` is the root CLI front door and command bus for Ankhorage.
 *
 * `ankh --help` and `ankh -h` discover command providers from the Ankh installation scope and
 * render the available top-level commands with their repository links. Help discovery is
 * independent of the caller's current working directory.
 *
 * Doctor is registered as a core provider, so `ankh doctor ...` remains available even when no
 * repo-local provider package has been installed. A discovered local `@ankhorage/doctor` package
 * takes precedence for command execution during development.
 *
 * No domain behavior belongs in the root CLI. Domain behavior stays in provider packages such as
 * infra, templates, studio, board, doctor, and dev.
 *
 * Root built-ins are help, planning, and version output. `ankh commands` is not a separate
 * bootstrap command; the command overview belongs to root help.
 *
 * `ankh <category> --help` and `ankh <category> -h` render provider-backed package help using the
 * package description and complete command list without exposing capability or provider metadata.
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
