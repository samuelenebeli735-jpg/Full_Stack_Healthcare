import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { displayName, useAuth } from '@/auth/AuthContext';
import { Button, Card, CardTitle, IconCircle, InfoRow, Muted, Screen, SectionTitle, Title, space } from '@/components/ui';
import { formatClinicDate } from '@/lib/clinicTime';

export default function StudentProfile() {
  const { user, signOut, refresh } = useAuth();
  // Re-read the profile from the server each time this tab opens.
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh])
  );
  const p = user?.profile;
  const dob = p?.dateOfBirth ? formatClinicDate(p.dateOfBirth.slice(0, 10)) : null;
  return (
    <Screen>
      <Title>Profile</Title>
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

      <SectionTitle>Student details</SectionTitle>
      <Card>
        <InfoRow label="Matric number" value={p?.matricNumber} />
        <InfoRow label="Faculty / department" value={[p?.faculty, p?.department].filter(Boolean).join(' · ')} />
        <InfoRow label="Level" value={p?.level ? `${p.level} level` : null} />
        <InfoRow label="Gender" value={p?.gender} />
        <InfoRow label="Date of birth" value={dob} />
        <InfoRow label="Phone" value={p?.phone} />
        <InfoRow label="Emergency contact" value={[p?.emergencyContactName, p?.emergencyContactPhone].filter(Boolean).join(' · ')} />
      </Card>

      <SectionTitle>Health</SectionTitle>
      <Card>
        <InfoRow label="Blood group" value={p?.bloodGroup} />
        <InfoRow label="Genotype" value={p?.genotype} />
        <InfoRow label="Allergies" value={p?.allergies} />
      </Card>

      <Button title="Edit profile" icon="create-outline" onPress={() => router.push('/edit-profile')} />
      <SectionTitle>Records</SectionTitle>
      <Button title="Medical history" variant="secondary" icon="document-text-outline" onPress={() => router.push('/medical-history')} />
      <Button title="Prescriptions" variant="secondary" icon="medical-outline" onPress={() => router.push('/prescriptions')} />
      <SectionTitle>Account</SectionTitle>
      <Button title="Reminder settings" variant="secondary" icon="notifications-outline" onPress={() => router.push('/notification-preferences')} />
      <Button title="Change password" variant="secondary" icon="key-outline" onPress={() => router.push('/change-password')} />
      <Button title="Sign out" variant="link" icon="log-out-outline" onPress={() => void signOut()} />
    </Screen>
  );
}
