import { router } from 'expo-router';
import { View } from 'react-native';

import { myAppointments, type Appointment } from '@/api/student';
import {
  Button,
  CardTitle,
  DateBlock,
  EmptyState,
  ErrorBanner,
  Loading,
  Muted,
  PressableCard,
  Screen,
  SectionTitle,
  StatusBadge,
  Title,
  statusColor,
} from '@/components/ui';
import { OPEN_STATUSES as OPEN, doctorName } from '@/lib/appointments';
import { formatTime, toClinicParts } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

export default function AppointmentsList() {
  const { data, error, loading, reload } = useFocusData(myAppointments);

  if (loading && !data) return <Loading />;

  const all = data ?? [];
  const upcoming = all
    .filter((a) => OPEN.includes(a.status))
    .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
  const past = all.filter((a) => !OPEN.includes(a.status));

  const row = (a: Appointment, upcomingRow: boolean) => {
    const { date, time } = toClinicParts(a.appointmentDate);
    return (
      <PressableCard
        key={a.id}
        accent={statusColor(a.status)}
        onPress={() => router.push({ pathname: '/student/appointments/[id]', params: { id: a.id } })}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <DateBlock date={date} tone={upcomingRow ? 'primary' : 'neutral'} />
          <View style={{ flex: 1 }}>
            <CardTitle>{a.service?.name || 'Appointment'}</CardTitle>
            <Muted>
              {formatTime(time)} · {doctorName(a)}
            </Muted>
            <View style={{ marginTop: 6 }}>
              <StatusBadge status={a.status} />
            </View>
          </View>
        </View>
      </PressableCard>
    );
  };

  return (
    <Screen onRefresh={reload}>
      <Title>Appointments</Title>
      <ErrorBanner message={error} />
      <Button title="Book an appointment" icon="add-circle-outline" onPress={() => router.push('/student/appointments/book')} />
      <SectionTitle>Upcoming</SectionTitle>
      {upcoming.length ? (
        upcoming.map((a) => row(a, true))
      ) : (
        <EmptyState icon="calendar-outline" title="No upcoming appointments" message="Your booked visits will appear here." />
      )}
      <SectionTitle>History</SectionTitle>
      {past.length ? (
        past.map((a) => row(a, false))
      ) : (
        <EmptyState icon="time-outline" title="No past appointments yet" />
      )}
    </Screen>
  );
}
