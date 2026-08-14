import { describe, expect, it } from 'bun:test';

import { createCommandInteraction } from '../src/createCommandInteraction.js';

describe('createCommandInteraction', () => {
  it('returns unavailable without asking when interaction is disabled', async () => {
    let asked = false;
    const interaction = createCommandInteraction({
      interactive: false,
      ask: () => {
        asked = true;
        return Promise.resolve('yes');
      },
    });

    expect(await interaction.confirm('Deploy?')).toBe('unavailable');
    expect(asked).toBeFalse();
  });

  it('normalizes affirmative answers and treats other answers as declined', async () => {
    const yes = createCommandInteraction({
      interactive: true,
      ask: () => Promise.resolve(' YES '),
    });
    const no = createCommandInteraction({
      interactive: true,
      ask: () => Promise.resolve(''),
    });

    expect(await yes.confirm('Deploy?')).toBe('confirmed');
    expect(await no.confirm('Deploy?')).toBe('declined');
  });
});
