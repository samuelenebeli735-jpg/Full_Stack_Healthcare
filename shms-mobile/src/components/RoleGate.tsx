import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import type { Role } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Loading } from '@/components/ui';

/** Render children only for a signed-in user with the given role. */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status !== 'signedIn' || !user || user.role !== role) return <Redirect href="/" />;
  return <>{children}</>;
}
