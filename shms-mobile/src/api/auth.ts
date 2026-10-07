import { request } from '@/api/client';
import type { Organization, User } from '@/api/types';

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

/** Student self-registration; returns a session like login. */
export const register = (input: RegisterInput) =>
  request<Session>('POST', '/auth/register', input);

export const activeOrganizations = () =>
  request<Organization[]>('GET', '/organizations/active');

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<unknown>('PUT', '/profiles/password', { currentPassword, newPassword });
