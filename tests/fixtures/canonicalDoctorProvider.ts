import type { Capability } from '@ankhorage/contracts/capabilities';
import doctorProvider from '@ankhorage/doctor/cli';

const capabilities = [
  {
    id: 'doctor.validate',
    owner: '@ankhorage/doctor',
    access: ['invoke'],
  },
  {
    id: 'doctor.fix',
    owner: '@ankhorage/doctor',
    access: ['invoke'],
  },
  {
    id: 'doctor.repo',
    owner: '@ankhorage/doctor',
    access: ['invoke'],
  },
  {
    id: 'doctor.package',
    owner: '@ankhorage/doctor',
    access: ['invoke'],
  },
] as const satisfies readonly Capability[];

/*** Provide Doctor's released handlers through a canonical capability manifest fixture. */
const canonicalDoctorProvider = {
  ...asRecord(doctorProvider),
  capabilities,
};

export default canonicalDoctorProvider;

/*** Preserve the released Doctor handler fields while replacing only capability metadata. */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Doctor CLI provider must default-export an object.');
  }
  return value as Record<string, unknown>;
}
