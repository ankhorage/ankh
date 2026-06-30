import { describe, expect, it } from 'bun:test';

import { parseArgv } from '../src/parser.js';

describe('parseArgv', () => {
  it('treats no args as help', () => {
    expect(parseArgv([])).toEqual({ kind: 'help' });
  });

  it('recognizes help tokens', () => {
    expect(parseArgv(['--help'])).toEqual({ kind: 'help' });
    expect(parseArgv(['-h'])).toEqual({ kind: 'help' });
    expect(parseArgv(['help'])).toEqual({ kind: 'help' });
  });

  it('recognizes version tokens', () => {
    expect(parseArgv(['--version'])).toEqual({ kind: 'version' });
    expect(parseArgv(['-v'])).toEqual({ kind: 'version' });
  });

  it('recognizes commands as a built-in', () => {
    expect(parseArgv(['commands'])).toEqual({ kind: 'commands' });
  });

  it('passes other tokens through as dispatch input', () => {
    expect(parseArgv(['foo'])).toEqual({ kind: 'dispatch', tokens: ['foo'] });
    expect(parseArgv(['foo', 'bar'])).toEqual({
      kind: 'dispatch',
      tokens: ['foo', 'bar'],
    });
  });
});
