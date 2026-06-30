import { describe, expect, it } from 'bun:test';

import packageJson from '../package.json';

describe('package.json', () => {
  it('publishes the ankh binary entrypoint', () => {
    expect(packageJson.bin).toEqual({
      ankh: './dist/bin.js',
    });
  });

  it('does not publish top-level ankh package metadata yet', () => {
    expect('ankh' in packageJson).toBeFalse();
  });
});
