import { createInterface } from 'node:readline/promises';

import type { AnkhCommandInteraction } from './commandInteraction.js';
import { createCommandInteraction } from './createCommandInteraction.js';

export function createDefaultCommandInteraction(): AnkhCommandInteraction {
  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
  return createCommandInteraction({
    interactive,
    ...(interactive ? { ask: askProcess } : {}),
  });
}

async function askProcess(prompt: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await readline.question(prompt);
  } finally {
    readline.close();
  }
}
