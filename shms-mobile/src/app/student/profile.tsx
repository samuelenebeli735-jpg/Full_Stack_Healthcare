import { Text } from 'react-native';

import { displayName, useAuth } from '@/auth/AuthContext';
import { Button, Card, Muted, Screen, Title, colors } from '@/components/ui';

export default function StudentProfile() {
  const { user, signOut } = useAuth();
  const p = user?.profile;
  return (
    <Screen>
      <Title>Profile</Title>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{displayName(user)}</Text>
        <Muted>{user?.email}</Muted>
        <Muted>Matric number: {p?.matricNumber || '—'}</Muted>
        <Muted>
          {[p?.faculty, p?.department, p?.level ? `${p.level} level` : null].filter(Boolean).join(' · ') || '—'}
        </Muted>
      </Card>
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
