import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { patientRecord } from '@/api/staff';
import { Banner, Card, CardTitle, EmptyState, ErrorBanner, IconCircle, InfoRow, Loading, Muted, Pill, Screen, SectionTitle, space } from '@/components/ui';
import { formatClinicDate } from '@/lib/clinicTime';
import { patientName } from '@/lib/patients';
import { useFocusData } from '@/lib/useAsync';

/** A patient's record as GET /medical-records/:id returns it (profile-level, as on the web). */
export default function PatientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: r, error, loading, reload } = useFocusData(() => patientRecord(id));

  if (loading && !r) return <Loading />;
  if (!r) {
    return (
      <Screen>
        <ErrorBanner message={error} />
        {error ? null : <EmptyState icon="person-outline" title="Patient record not found" />}
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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconCircle name="person" size={52} />
          <View style={{ flex: 1, marginLeft: space.md }}>
            <CardTitle style={{ fontSize: 18 }}>{patientName(p)}</CardTitle>
            <Muted>{p?.user?.email || '—'}</Muted>
            {p?.user?.isActive === false ? <Pill tone="danger">Account deactivated</Pill> : null}
          </View>
        </View>
      </Card>
      {p?.allergies ? <Banner tone="danger" title="Allergies">{p.allergies}</Banner> : null}

      <SectionTitle>Record</SectionTitle>
      <Card>
        <InfoRow label="Record number" value={r.recordNumber} />
        <InfoRow label="Status" value={r.status === 'archived' ? 'Archived' : 'Active'} />
        <InfoRow label="Record created" value={created} />
      </Card>

      <SectionTitle>Student</SectionTitle>
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
    </Screen>
  );
}
