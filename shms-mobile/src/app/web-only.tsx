import { Redirect } from 'expo-router';

import { displayName, useAuth } from '@/auth/AuthContext';
import { Banner, BrandHeader, Button, Screen } from '@/components/ui';

/** Admin and super admin work on the SHMS web dashboard. */
export default function WebOnly() {
  const { status, user, signOut } = useAuth();
  if (status !== 'signedIn' || !user) return <Redirect href="/" />;

  return (
    <Screen>
      <BrandHeader subtitle="Use the web dashboard" />
      <Banner tone="info" title={`Signed in as ${displayName(user)} (${user.role === 'super_admin' ? 'Super Admin' : 'Admin'})`}>
        Administration is available on the SHMS web dashboard. The mobile app is for students and clinic staff.
      </Banner>
      <Button title="Sign out" variant="secondary" icon="log-out-outline" onPress={() => void signOut()} />
    </Screen>
  );
}
