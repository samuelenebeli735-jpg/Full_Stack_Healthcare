import { displayName, useAuth } from '@/auth/AuthContext';
import { Card, Muted, Screen, Title } from '@/components/ui';

export default function StaffHome() {
  const { user } = useAuth();
  return (
    <Screen>
      <Title>Hello, {displayName(user)}</Title>
      <Card>
        <Muted>{user?.organization?.name}</Muted>
        <Muted>Signed in as clinic staff</Muted>
      </Card>
      <Muted>Today’s queue and consultations are coming next.</Muted>
    </Screen>
  );
}
