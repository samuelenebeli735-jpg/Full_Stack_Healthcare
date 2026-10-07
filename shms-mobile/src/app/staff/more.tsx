import { router } from 'expo-router';

import { displayName, useAuth } from '@/auth/AuthContext';
import { Button, Card, Muted, Screen, Title } from '@/components/ui';

export default function StaffMore() {
  const { user, signOut } = useAuth();
  return (
    <Screen>
      <Title>More</Title>
      <Card>
        <Muted>{displayName(user)}</Muted>
        <Muted>{user?.email}</Muted>
        <Muted>{user?.organization?.name}</Muted>
      </Card>
      <Button title="Reminder settings" variant="secondary" onPress={() => router.push('/notification-preferences')} />
      <Button title="Change password" variant="secondary" onPress={() => router.push('/change-password')} />
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
