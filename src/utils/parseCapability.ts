import type { Capability } from '@ankhorage/contracts/capabilities';

const CAPABILITY_ACCESS = new Set(['emit', 'invoke', 'read', 'subscribe', 'write']);
const DATA_SCHEMA_TYPES = new Set([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
]);

/*** Parse one canonical Contracts capability descriptor from untrusted package/provider metadata. */
export function parseCapability(value: unknown): Capability | null {
  if (!isRecord(value)) return null;
  if (!isCapabilityId(value.id) || !isNonEmptyString(value.owner)) return null;
  if (
    !Array.isArray(value.access) ||
    value.access.length === 0 ||
    !value.access.every((entry) => typeof entry === 'string' && CAPABILITY_ACCESS.has(entry))
  ) {
    return null;
  }
  if (!isOptionalString(value.label) || !isOptionalString(value.description)) return null;
  if (value.input !== undefined && !isDataSchemaSlot(value.input)) return null;
  if (value.output !== undefined && !isDataSchemaSlot(value.output)) return null;

  return {
    id: value.id,
    owner: value.owner,
    access: value.access,
    ...(value.label === undefined ? {} : { label: value.label }),
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.input === undefined ? {} : { input: value.input }),
    ...(value.output === undefined ? {} : { output: value.output }),
  };
}

/*** Validate the stable dot-separated capability identifier. */
function isCapabilityId(value: unknown): value is Capability['id'] {
  if (typeof value !== 'string') return false;
  const segments = value.split('.');
  return segments.length >= 2 && segments.every((segment) => segment.length > 0);
}

/*** Validate one optional descriptive string. */
function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

/*** Validate one required non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/*** Validate a capability input/output schema slot. */
function isDataSchemaSlot(value: unknown): value is NonNullable<Capability['input']> {
  return (
    isRecord(value) &&
    (value.schema === undefined || isDataSchema(value.schema)) &&
    (value.schemaRef === undefined || isDataSchemaRef(value.schemaRef))
  );
}

/*** Validate the portable schema shape used by capability input/output metadata. */
function isDataSchema(value: unknown): boolean {
  if (!isRecord(value) || !isDataSchemaType(value.type)) return false;
  return isValidSchemaMetadata(value) && isValidSchemaComposition(value);
}

/*** Validate non-composition DataSchema fields. */
function isValidSchemaMetadata(value: Record<string, unknown>): boolean {
  return (
    isOptionalString(value.title) &&
    isOptionalString(value.description) &&
    isOptionalString(value.format) &&
    (value.nullable === undefined || typeof value.nullable === 'boolean') &&
    (value.required === undefined || isStringArray(value.required)) &&
    isValidSchemaProperties(value.properties) &&
    isValidAdditionalProperties(value.additionalProperties) &&
    (value.items === undefined || isDataSchema(value.items)) &&
    (value.ref === undefined || isDataSchemaRef(value.ref)) &&
    isSerializableSchemaValue(value.const) &&
    isSerializableSchemaValue(value.default) &&
    isValidSchemaEnum(value.enum)
  );
}

/*** Validate object properties against the same recursive schema contract. */
function isValidSchemaProperties(value: unknown): boolean {
  return value === undefined || (isRecord(value) && Object.values(value).every(isDataSchema));
}

/*** Validate an optional additional-properties schema. */
function isValidAdditionalProperties(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean' || isDataSchema(value);
}

/*** Validate an optional enum of serializable data values. */
function isValidSchemaEnum(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isSerializableValue));
}

/*** Validate recursive schema composition fields without dynamic property indexing. */
function isValidSchemaComposition(value: Record<string, unknown>): boolean {
  return (
    isDataSchemaArray(value.allOf) &&
    isDataSchemaArray(value.anyOf) &&
    isDataSchemaArray(value.oneOf)
  );
}

/*** Validate one optional recursive schema array. */
function isDataSchemaArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isDataSchema));
}

/*** Validate one supported schema type declaration. */
function isDataSchemaType(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value === 'string') return DATA_SCHEMA_TYPES.has(value);
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && DATA_SCHEMA_TYPES.has(entry))
  );
}

/*** Validate one schema reference. */
function isDataSchemaRef(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string';
}

/*** Validate an optional schema scalar value. */
function isSerializableSchemaValue(value: unknown): boolean {
  return value === undefined || isSerializableValue(value);
}

/*** Validate one JSON-serializable value recursively. */
function isSerializableValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isSerializableValue);
  return isRecord(value) && Object.values(value).every(isSerializableValue);
}

/*** Validate an array containing strings only. */
function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/*** Narrow an unknown value to a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
