import { describe, expect, test } from 'bun:test';

import { resolveAnkhInputValue } from './resolveAnkhInputValue.js';

describe('resolveAnkhInputValue', () => {
  test('uses explicit override before every lower-priority candidate', () => {
    expect(
      resolveAnkhInputValue({
        explicit: ' ui ',
        cli: 'cli',
        environment: 'env',
        defaultValue: 'default',
      }),
    ).toEqual({ value: 'ui', origin: 'explicit' });
  });

  test('falls through blank explicit values to CLI', () => {
    expect(
      resolveAnkhInputValue({
        explicit: '   ',
        cli: 'cli',
        environment: 'env',
        defaultValue: 'default',
      }),
    ).toEqual({ value: 'cli', origin: 'cli' });
  });

  test('uses environment after absent explicit and CLI values', () => {
    expect(
      resolveAnkhInputValue({
        explicit: undefined,
        cli: null,
        environment: ' env ',
        defaultValue: 'default',
      }),
    ).toEqual({ value: 'env', origin: 'environment' });
  });

  test('uses provider default only when higher-priority candidates are absent', () => {
    expect(
      resolveAnkhInputValue({
        explicit: '',
        cli: ' ',
        environment: undefined,
        defaultValue: ' default ',
      }),
    ).toEqual({ value: 'default', origin: 'default' });
  });

  test('returns null when every source is absent', () => {
    expect(
      resolveAnkhInputValue({
        explicit: '',
        cli: null,
        environment: ' ',
      }),
    ).toBeNull();
  });
});
