import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { Button, ErrorBanner, Loading, Screen, Title } from '@/components/ui';

/** Entry gate: send each user to the area for their role. */
export default function Index() {
  const { status, user, error, refresh, signOut } = useAuth();

  if (status === 'loading') return <Loading label="Loading SHMS…" />;

  if (status === 'offline') {
    return (
      <Screen>
        <Title>Can’t reach SHMS</Title>
        <ErrorBanner message={error} />
        <Button title="Try again" onPress={() => void refresh()} />
        <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
      </Screen>
    );
  }

  if (status === 'signedOut' || !user) return <Redirect href="/login" />;
  if (user.role === 'student') return <Redirect href="/student" />;
  if (user.role === 'staff') return <Redirect href="/staff" />;
  return <Redirect href="/web-only" />;
}
