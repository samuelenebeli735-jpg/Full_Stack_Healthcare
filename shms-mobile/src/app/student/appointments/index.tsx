import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { myAppointments, type Appointment } from '@/api/student';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Loading,
  Muted,
  PressableCard,
  Screen,
  SectionTitle,
  StatusBadge,
  Title,
  colors,
} from '@/components/ui';
import { OPEN_STATUSES as OPEN, doctorName } from '@/lib/appointments';
import { formatClinicDateTime } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

export default function AppointmentsList() {
  const { data, error, loading, reload } = useFocusData(myAppointments);

  if (loading && !data) return <Loading />;

  const all = data ?? [];
  const upcoming = all
    .filter((a) => OPEN.includes(a.status))
    .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
  const past = all.filter((a) => !OPEN.includes(a.status));

  const row = (a: Appointment) => (
    <PressableCard
      key={a.id}
      onPress={() => router.push({ pathname: '/student/appointments/[id]', params: { id: a.id } })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
            {a.service?.name || 'Appointment'}
          </Text>
          <Muted>{formatClinicDateTime(a.appointmentDate)}</Muted>
          <Muted>{doctorName(a)}</Muted>
        </View>
        <StatusBadge status={a.status} />
      </View>
    </PressableCard>
  );

  return (
    <Screen onRefresh={reload}>
      <Title>Appointments</Title>
      <ErrorBanner message={error} />
      <Button title="Book an appointment" onPress={() => router.push('/student/appointments/book')} />
      <SectionTitle>Upcoming</SectionTitle>
      {upcoming.length ? upcoming.map(row) : <EmptyState title="No upcoming appointments" />}
      <SectionTitle>History</SectionTitle>
      {past.length ? past.map(row) : <EmptyState title="No past appointments yet" />}
    </Screen>
  );
}
