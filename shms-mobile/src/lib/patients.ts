import type { Profile } from '@/api/types';

export function patientName(profile: Profile | null | undefined): string {
  if (!profile) return 'Patient';
  return [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') || 'Patient';
}

/** "Male · 22 yrs · O+ · AS" from what the profile records. */
export function patientFacts(profile: Profile | null | undefined): string {
  if (!profile) return '';
  let age: string | null = null;
  if (profile.dateOfBirth) {
    const dob = new Date(profile.dateOfBirth);
    if (!Number.isNaN(dob.getTime())) {
      const years = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
      age = `${years} yrs`;
    }
  }
  return [profile.gender, age, profile.bloodGroup, profile.genotype].filter(Boolean).join(' · ');
}
