import type { AnkhConfirmationResult } from './confirmationResult.js';

export interface AnkhCommandInteraction {
  readonly interactive: boolean;
  confirm(message: string): Promise<AnkhConfirmationResult>;
}
