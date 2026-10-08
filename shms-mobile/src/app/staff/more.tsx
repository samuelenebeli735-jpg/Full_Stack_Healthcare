import { router } from 'expo-router';
import { View } from 'react-native';

import { displayName, useAuth } from '@/auth/AuthContext';
import { Button, Card, CardTitle, IconCircle, Muted, Screen, SectionTitle, Title, space } from '@/components/ui';

export default function StaffMore() {
  const { user, signOut } = useAuth();
  return (
    <Screen>
      <Title>More</Title>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconCircle name="person" size={52} />
          <View style={{ flex: 1, marginLeft: space.md }}>
            <CardTitle style={{ fontSize: 18 }}>{displayName(user)}</CardTitle>
            <Muted>{user?.email}</Muted>
            <Muted>{user?.organization?.name}</Muted>
          </View>
        </View>
      </Card>
      <SectionTitle>Account</SectionTitle>
      <Button title="Reminder settings" variant="secondary" icon="notifications-outline" onPress={() => router.push('/notification-preferences')} />
      <Button title="Change password" variant="secondary" icon="key-outline" onPress={() => router.push('/change-password')} />
      <Button title="Sign out" variant="link" icon="log-out-outline" onPress={() => void signOut()} />
    </Screen>
  );
}
