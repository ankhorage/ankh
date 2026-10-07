import type { Capability } from '@ankhorage/contracts/capabilities';

/*** Create one Ankh-owned test capability without defining another package's public namespace. */
export function createCapability(id: Capability['id']): Capability {
  if (!id.startsWith('fixture.')) {
    throw new Error(`Ankh test capabilities must use the fixture namespace, received "${id}".`);
  }

  return {
    id,
    owner: '@ankhorage/fixture',
    access: ['invoke'],
    binding: {
      kind: 'action',
      bindableAs: ['target'],
    },
  };
}

/*** Create canonical fixture descriptors for one list of test-only identifiers. */
export function createCapabilities(ids: readonly Capability['id'][]): readonly Capability[] {
  return ids.map(createCapability);
}
