import type { AnkhCommandInteraction } from './commandInteraction.js';

export function createCommandInteraction(options: {
  readonly interactive: boolean;
  readonly ask?: (prompt: string) => Promise<string>;
}): AnkhCommandInteraction {
  return {
    interactive: options.interactive,
    async confirm(message: string) {
      if (!options.interactive || options.ask === undefined) return 'unavailable';
      const answer = (await options.ask(`${message} [y/N] `)).trim().toLowerCase();
      return answer === 'y' || answer === 'yes' ? 'confirmed' : 'declined';
    },
  };
}
