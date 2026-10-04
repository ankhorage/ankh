import type { Capability } from '@ankhorage/contracts/capabilities';

/*** Create one canonical capability fixture owned by the namespace implied by its identifier. */
export function createCapability(id: Capability['id']): Capability {
  const [namespace] = id.split('.');
  return {
    id,
    owner: `@ankhorage/${namespace ?? 'fixture'}`,
    access: ['invoke'],
  };
}

/*** Create canonical capability fixtures for one list of identifiers. */
export function createCapabilities(ids: readonly Capability['id'][]): readonly Capability[] {
  return ids.map(createCapability);
}
