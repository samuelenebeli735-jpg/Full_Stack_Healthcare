import { Redirect } from 'expo-router';

import { displayName, useAuth } from '@/auth/AuthContext';
import { Button, Card, Muted, Screen, Title } from '@/components/ui';

/** Admin and super admin work on the SHMS web dashboard. */
export default function WebOnly() {
  const { status, user, signOut } = useAuth();
  if (status !== 'signedIn' || !user) return <Redirect href="/" />;

  return (
    <Screen>
      <Title>Use the web dashboard</Title>
      <Card>
        <Muted>
          Signed in as {displayName(user)} ({user.role === 'super_admin' ? 'Super Admin' : 'Admin'}). Administration is
          available on the SHMS web dashboard. The mobile app is for students and clinic staff.
        </Muted>
      </Card>
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
