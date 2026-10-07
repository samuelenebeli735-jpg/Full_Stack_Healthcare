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
      </Card>
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
