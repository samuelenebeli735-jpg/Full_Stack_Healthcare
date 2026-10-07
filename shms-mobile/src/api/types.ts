/** Shapes returned by the SHMS API (see shms-backend services/repositories). */

export type Role = 'student' | 'staff' | 'admin' | 'super_admin';

export interface Organization {
  id: string;
  name: string;
  slug?: string;
}

export interface Profile {
  id: string;
  userId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  matricNumber?: string | null;
  faculty?: string | null;
  department?: string | null;
  level?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  bloodGroup?: string | null;
  genotype?: string | null;
  allergies?: string | null;
}

/** GET /auth/verify and POST /auth/login `user`. */
export interface User {
  id: string;
  organizationId: string;
  email: string | null;
  role: Role;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  profile: Profile | null;
  organization: Organization | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface FieldError {
  field: string;
  message: string;
}
