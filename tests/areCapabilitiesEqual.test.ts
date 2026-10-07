import type { Capability } from '@ankhorage/contracts/capabilities';
import { describe, expect, it } from 'bun:test';

import { areCapabilitiesEqual } from '../src/utils/areCapabilitiesEqual.js';

describe('areCapabilitiesEqual', () => {
  it('ignores object property and access ordering for equivalent descriptors', () => {
    const first = {
      id: 'fixture.shared',
      owner: '@ankhorage/fixture',
      access: ['invoke', 'read'],
      label: 'Shared',
      input: {
        schema: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            count: { type: 'number' },
          },
        },
      },
    } as const satisfies Capability;
    const second = {
      input: {
        schema: {
          properties: {
            count: { type: 'number' },
            value: { type: 'string' },
          },
          type: 'object',
        },
      },
      label: 'Shared',
      access: ['read', 'invoke'],
      owner: '@ankhorage/fixture',
      id: 'fixture.shared',
    } as const satisfies Capability;

    expect(areCapabilitiesEqual(first, second)).toBe(true);
  });

  it('rejects conflicting descriptors with the same id', () => {
    const first = {
      id: 'fixture.shared',
      owner: '@ankhorage/fixture',
      access: ['invoke'],
    } as const satisfies Capability;
    const second = {
      id: 'fixture.shared',
      owner: '@ankhorage/fixture',
      access: ['read'],
    } as const satisfies Capability;

    expect(areCapabilitiesEqual(first, second)).toBe(false);
  });
});
