#!/usr/bin/env bun

import { runCli } from './cli/index.js';

const result = await runCli(process.argv.slice(2));

process.exit(result.exitCode);
