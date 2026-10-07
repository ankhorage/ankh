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
  const leftValues = new Set(left);
  const rightValues = new Set(right);
  return (
    leftValues.size === rightValues.size &&
    leftValues.size === left.length &&
    rightValues.size === right.length &&
    [...leftValues].every((value) => rightValues.has(value))
  );
}
