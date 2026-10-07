import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { patientRecord } from '@/api/staff';
import { Card, EmptyState, ErrorBanner, Loading, Muted, Screen, SectionTitle, colors } from '@/components/ui';
import { formatClinicDate } from '@/lib/clinicTime';
import { patientName } from '@/lib/patients';
import { useFocusData } from '@/lib/useAsync';

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 15, color: colors.text }}>{value || '—'}</Text>
    </View>
  );
}

/** A patient's record as GET /medical-records/:id returns it (profile-level, as on the web). */
export default function PatientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: r, error, loading, reload } = useFocusData(() => patientRecord(id));

  if (loading && !r) return <Loading />;
  if (!r) {
    return (
      <Screen>
        <ErrorBanner message={error} />
        {error ? null : <EmptyState title="Patient record not found" />}
      </Screen>
    );
  }

  const p = r.profile;
  const dob = p?.dateOfBirth ? formatClinicDate(String(p.dateOfBirth).slice(0, 10)) : null;
  const created = r.createdAt ? formatClinicDate(String(r.createdAt).slice(0, 10)) : null;

  return (
    <Screen onRefresh={reload}>
      <ErrorBanner message={error} />
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{patientName(p)}</Text>
        <Muted>{p?.user?.email || '—'}</Muted>
        {p?.user?.isActive === false ? <Text style={{ color: colors.danger }}>Account deactivated</Text> : null}
        {p?.allergies ? <Text style={{ color: colors.danger, marginTop: 6 }}>Allergies: {p.allergies}</Text> : null}
      </Card>

      <SectionTitle>Record</SectionTitle>
      <Card>
        <Row label="Record number" value={r.recordNumber} />
        <Row label="Status" value={r.status === 'archived' ? 'Archived' : 'Active'} />
        <Row label="Record created" value={created} />
      </Card>

      <SectionTitle>Student</SectionTitle>
      <Card>
        <Row label="Matric number" value={p?.matricNumber} />
        <Row label="Faculty / department" value={[p?.faculty, p?.department].filter(Boolean).join(' · ')} />
        <Row label="Level" value={p?.level ? `${p.level} level` : null} />
        <Row label="Gender" value={p?.gender} />
        <Row label="Date of birth" value={dob} />
        <Row label="Phone" value={p?.phone} />
        <Row label="Emergency contact" value={[p?.emergencyContactName, p?.emergencyContactPhone].filter(Boolean).join(' · ')} />
      </Card>

      <SectionTitle>Health</SectionTitle>
      <Card>
        <Row label="Blood group" value={p?.bloodGroup} />
        <Row label="Genotype" value={p?.genotype} />
        <Row label="Allergies" value={p?.allergies} />
      </Card>
    </Screen>
  );
}
