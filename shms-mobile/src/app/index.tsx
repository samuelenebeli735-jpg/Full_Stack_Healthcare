import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { BrandHeader, Button, ErrorBanner, Loading, Screen } from '@/components/ui';

/** Entry gate: send each user to the area for their role. */
export default function Index() {
  const { status, user, error, refresh, signOut } = useAuth();

  if (status === 'loading') return <Loading label="Loading SHMS…" />;

  if (status === 'offline') {
    return (
      <Screen>
        <BrandHeader subtitle="Can’t reach SHMS right now" />
        <ErrorBanner message={error} />
        <Button title="Try again" icon="refresh" onPress={() => void refresh()} />
        <Button title="Sign out" variant="link" onPress={() => void signOut()} />
      </Screen>
    );
  }

  if (status === 'signedOut' || !user) return <Redirect href="/login" />;
  if (user.role === 'student') return <Redirect href="/student" />;
  if (user.role === 'staff') return <Redirect href="/staff" />;
  return <Redirect href="/web-only" />;
}
