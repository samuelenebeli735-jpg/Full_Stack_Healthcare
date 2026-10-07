import { request, requestWithMessage } from '@/api/client';
import type { Organization, Profile, User } from '@/api/types';

export interface Session {
  user: User;
  token: string;
}

/** identifier: email, matric number or staff number. */
export const login = (identifier: string, password: string) =>
  request<Session>('POST', '/auth/login', { identifier, password });

export const verify = () => request<{ user: User }>('GET', '/auth/verify');

export interface RegisterInput {
  organizationId: string;
  email: string;
  password: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  matricNumber: string;
  faculty: string;
  department: string;
  level: string;
  gender: 'Male' | 'Female';
  dateOfBirth: string; // YYYY-MM-DD
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bloodGroup?: string;
  genotype?: string;
  allergies?: string;
}

/**
 * Student self-registration. Unlike login, `user` here has no profile or
 * organization; the profile is returned beside it.
 */
export interface RegisterResult {
  user: Omit<User, 'profile' | 'organization'>;
  profile: Profile;
  token: string;
}

export const register = (input: RegisterInput) =>
  request<RegisterResult>('POST', '/auth/register', input);

export const activeOrganizations = () =>
  request<Organization[]>('GET', '/organizations/active');

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<unknown>('PUT', '/profiles/password', { currentPassword, newPassword });

export type ProfileUpdate = Partial<
  Pick<
    RegisterInput,
    | 'firstName'
    | 'middleName'
    | 'lastName'
    | 'faculty'
    | 'department'
    | 'level'
    | 'gender'
    | 'dateOfBirth'
    | 'phone'
    | 'emergencyContactName'
    | 'emergencyContactPhone'
    | 'bloodGroup'
    | 'genotype'
    | 'allergies'
  >
>;

/** Student's own profile (PUT /profiles/me). */
export const updateMyProfile = (data: ProfileUpdate) => request<unknown>('PUT', '/profiles/me', data);

export const LEVELS = ['100', '200', '300', '400', '500', '600', '700'] as const;
export const GENDERS = ['Male', 'Female'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const GENOTYPES = ['AA', 'AS', 'AC', 'SS', 'SC'] as const;

/**
 * Ask for a password-reset email. The server answers the same way for every
 * address; the reset itself is completed on the SHMS website from the link.
 */
export const forgotPassword = async (email: string) =>
  (await requestWithMessage<unknown>('POST', '/auth/forgot-password', { email })).message;
