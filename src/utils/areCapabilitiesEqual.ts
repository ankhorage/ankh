import { isDeepStrictEqual } from 'node:util';

import type { Capability } from '@ankhorage/contracts/capabilities';

/*** Compare canonical capability descriptors independent of object property and access ordering. */
export function areCapabilitiesEqual(left: Capability, right: Capability): boolean {
  const { access: leftAccess, ...leftDescriptor } = left;
  const { access: rightAccess, ...rightDescriptor } = right;

  return (
    hasSameStringValues(leftAccess, rightAccess) &&
    isDeepStrictEqual(leftDescriptor, rightDescriptor)
  );
}

/*** Compare two string collections as sets. */
function hasSameStringValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
