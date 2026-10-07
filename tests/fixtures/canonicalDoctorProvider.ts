import type { Capability } from '@ankhorage/contracts/capabilities';
import doctorProvider from '@ankhorage/doctor/cli';

export const DOCTOR_FIXTURE_CAPABILITIES = [
  {
    id: 'fixture.doctor.validate',
    owner: '@ankhorage/fixture',
    access: ['invoke'],
  },
  {
    id: 'fixture.doctor.fix',
    owner: '@ankhorage/fixture',
    access: ['invoke'],
  },
  {
    id: 'fixture.doctor.repo',
    owner: '@ankhorage/fixture',
    access: ['invoke'],
  },
  {
    id: 'fixture.doctor.package',
    owner: '@ankhorage/fixture',
    access: ['invoke'],
  },
] as const satisfies readonly Capability[];

const CAPABILITY_ID_MAP = new Map<string, Capability['id']>([
  ['doctor.validate', 'fixture.doctor.validate'],
  ['doctor.fix', 'fixture.doctor.fix'],
  ['doctor.repo', 'fixture.doctor.repo'],
  ['doctor.package', 'fixture.doctor.package'],
]);

const provider = asRecord(doctorProvider);
const commands = readCommands(provider.commands).map((command) => {
  const capability = CAPABILITY_ID_MAP.get(readCapabilityId(command.capability));
  if (capability === undefined) {
    throw new Error('Doctor fixture command must reference a known Doctor capability.');
  }

  return {
    ...command,
    capability,
  };
});

/*** Provide Doctor's released handlers through a fixture-owned capability manifest. */
const canonicalDoctorProvider = {
  ...provider,
  capabilities: DOCTOR_FIXTURE_CAPABILITIES,
  commands,
};

export default canonicalDoctorProvider;

/*** Read provider command descriptors from the released Doctor provider. */
function readCommands(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error('Doctor CLI provider must expose command descriptors.');
  }

  return value.map(asRecord);
}

/*** Read one provider command capability id. */
function readCapabilityId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Doctor CLI command must expose a capability id.');
  }
  return value;
}

/*** Preserve the released Doctor provider fields while replacing only test-owned metadata. */
function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Doctor CLI provider value must be an object.');
  }
  return value;
}

/*** Narrow an unknown Doctor provider value to a record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
