import { displayName, useAuth } from '@/auth/AuthContext';
import { Card, Muted, Screen, Title } from '@/components/ui';

export default function StudentHome() {
  const { user } = useAuth();
  return (
    <Screen>
      <Title>Hello, {user?.profile?.firstName || displayName(user)}</Title>
      <Card>
        <Muted>{user?.organization?.name}</Muted>
        <Muted>Matric number: {user?.profile?.matricNumber || '—'}</Muted>
      </Card>
      <Muted>Appointments, check-in and queue status are coming next.</Muted>
    </Screen>
  );
}
