import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { myAppointments, myQueue, notifications } from '@/api/student';
import { displayName, useAuth } from '@/auth/AuthContext';
import { Button, Card, ErrorBanner, Loading, Muted, PressableCard, Screen, SectionTitle, StatusBadge, Title, colors } from '@/components/ui';
import { OPEN_STATUSES, doctorName } from '@/lib/appointments';
import { formatClinicDateTime } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

async function loadHome() {
  const [appointments, queue, notes] = await Promise.all([myAppointments(), myQueue(), notifications(1)]);
  const next = appointments
    .filter((a) => OPEN_STATUSES.includes(a.status))
    .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate))[0];
  return { next, queue, unread: notes.unreadCount };
}

export default function StudentHome() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useFocusData(loadHome);

  if (loading && !data) return <Loading />;

  return (
    <Screen onRefresh={reload}>
      <Title>Hello, {user?.profile?.firstName || displayName(user)}</Title>
      <Muted>{user?.organization?.name}</Muted>
      <View style={{ height: 12 }} />
      <ErrorBanner message={error} />

      {data?.queue && data.queue.status !== 'completed' && data.queue.status !== 'cancelled' ? (
        <PressableCard onPress={() => router.navigate('/student/queue')}>
          <Muted>You are in the queue</Muted>
          <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary }}>#{data.queue.queueNumber}</Text>
          <StatusBadge status={data.queue.status} />
          {data.queue.status === 'waiting' ? <Muted>{data.queue.patientsAhead} ahead of you</Muted> : null}
        </PressableCard>
      ) : null}

      <SectionTitle>Next appointment</SectionTitle>
      {data?.next ? (
        <PressableCard
          onPress={() => router.push({ pathname: '/student/appointments/[id]', params: { id: data.next!.id } })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{data.next.service?.name || 'Appointment'}</Text>
              <Muted>{formatClinicDateTime(data.next.appointmentDate)}</Muted>
              <Muted>{doctorName(data.next)}</Muted>
            </View>
            <StatusBadge status={data.next.status} />
          </View>
        </PressableCard>
      ) : (
        <Card>
          <Muted>You have no upcoming appointments.</Muted>
        </Card>
      )}
      <Button title="Book an appointment" onPress={() => router.navigate('/student/appointments/book')} />

      <SectionTitle>My health</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PressableCard onPress={() => router.push('/medical-history')}>
            <Text style={{ fontWeight: '600', color: colors.text }}>Medical history</Text>
            <Muted>Past visits</Muted>
          </PressableCard>
        </View>
        <View style={{ flex: 1 }}>
          <PressableCard onPress={() => router.push('/prescriptions')}>
            <Text style={{ fontWeight: '600', color: colors.text }}>Prescriptions</Text>
            <Muted>Medicines</Muted>
          </PressableCard>
        </View>
      </View>

      {data && data.unread > 0 ? (
        <PressableCard onPress={() => router.navigate('/student/notifications')}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>
            {data.unread} unread notification{data.unread === 1 ? '' : 's'}
          </Text>
        </PressableCard>
      ) : null}
    </Screen>
  );
}
