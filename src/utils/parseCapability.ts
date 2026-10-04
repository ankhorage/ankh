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
    !value.access.every(
      (entry) => typeof entry === 'string' && CAPABILITY_ACCESS.has(entry),
    )
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
  if (!isOptionalString(value.title) || !isOptionalString(value.description)) return false;
  if (!isOptionalString(value.format)) return false;
  if (value.nullable !== undefined && typeof value.nullable !== 'boolean') return false;
  if (value.required !== undefined && !isStringArray(value.required)) return false;
  if (
    value.properties !== undefined &&
    (!isRecord(value.properties) || !Object.values(value.properties).every(isDataSchema))
  ) {
    return false;
  }
  if (
    value.additionalProperties !== undefined &&
    typeof value.additionalProperties !== 'boolean' &&
    !isDataSchema(value.additionalProperties)
  ) {
    return false;
  }
  if (value.items !== undefined && !isDataSchema(value.items)) return false;
  if (value.ref !== undefined && !isDataSchemaRef(value.ref)) return false;
  if (!isSerializableSchemaValue(value.const)) return false;
  if (!isSerializableSchemaValue(value.default)) return false;
  if (
    value.enum !== undefined &&
    (!Array.isArray(value.enum) || !value.enum.every(isSerializableValue))
  ) {
    return false;
  }
  return ['allOf', 'anyOf', 'oneOf'].every((key) => {
    const entry = value[key];
    return entry === undefined || (Array.isArray(entry) && entry.every(isDataSchema));
  });
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
