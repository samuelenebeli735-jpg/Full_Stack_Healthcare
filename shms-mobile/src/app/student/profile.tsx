import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Text, View } from 'react-native';

import { displayName, useAuth } from '@/auth/AuthContext';
import { Button, Card, Muted, Screen, SectionTitle, Title, colors } from '@/components/ui';
import { formatClinicDate } from '@/lib/clinicTime';

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 15, color: colors.text }}>{value || '—'}</Text>
    </View>
  );
}

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
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{displayName(user)}</Text>
        <Muted>{user?.email}</Muted>
        <Muted>Matric number: {p?.matricNumber || '—'}</Muted>
        <Muted>{user?.organization?.name}</Muted>
      </Card>

      <SectionTitle>Details</SectionTitle>
      <Card>
        <Row label="Faculty / department" value={[p?.faculty, p?.department].filter(Boolean).join(' · ')} />
        <Row label="Level" value={p?.level ? `${p.level} level` : null} />
        <Row label="Gender" value={p?.gender} />
        <Row label="Date of birth" value={dob} />
        <Row label="Phone" value={p?.phone} />
        <Row label="Emergency contact" value={[p?.emergencyContactName, p?.emergencyContactPhone].filter(Boolean).join(' · ')} />
        <Row label="Blood group / genotype" value={[p?.bloodGroup, p?.genotype].filter(Boolean).join(' · ')} />
        <Row label="Allergies" value={p?.allergies} />
      </Card>

      <Button title="Edit profile" onPress={() => router.push('/edit-profile')} />
      <Button title="Medical history" variant="secondary" onPress={() => router.push('/medical-history')} />
      <Button title="Prescriptions" variant="secondary" onPress={() => router.push('/prescriptions')} />
      <Button title="Change password" variant="secondary" onPress={() => router.push('/change-password')} />
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
