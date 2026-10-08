import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { myAppointments, myQueue, notifications } from '@/api/student';
import { displayName, useAuth } from '@/auth/AuthContext';
import {
  Button,
  Card,
  CardTitle,
  DateBlock,
  EmptyState,
  ErrorBanner,
  IconCircle,
  Loading,
  Muted,
  PressableCard,
  Screen,
  SectionTitle,
  StatusBadge,
  Title,
  colors,
  radius,
  space,
  statusColor,
  type IconName,
} from '@/components/ui';
import { OPEN_STATUSES, doctorName } from '@/lib/appointments';
import { formatTime, toClinicParts } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

async function loadHome() {
  const [appointments, queue, notes] = await Promise.all([myAppointments(), myQueue(), notifications(1)]);
  const next = appointments
    .filter((a) => OPEN_STATUSES.includes(a.status))
    .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate))[0];
  return { next, queue, unread: notes.unreadCount };
}

function QuickAction({ icon, label, href }: { icon: IconName; label: string; href: Href }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        paddingVertical: space.md,
        borderRadius: radius.lg,
        backgroundColor: pressed ? colors.divider : colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      })}>
      <IconCircle name={icon} />
      <Text style={{ marginTop: 6, fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export default function StudentHome() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useFocusData(loadHome);

  if (loading && !data) return <Loading />;

  const q = data?.queue;
  const activeQueue = q && q.status !== 'completed' && q.status !== 'cancelled' ? q : null;

  return (
    <Screen onRefresh={reload}>
      <Title subtitle={user?.organization?.name}>Hello, {user?.profile?.firstName || displayName(user)}</Title>
      <ErrorBanner message={error} />

      {activeQueue ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/student/queue')}
          style={{ backgroundColor: colors.primary, borderRadius: radius.lg, padding: space.xl, marginBottom: space.md }}>
          <Text style={{ color: '#CFE0F5', fontSize: 13, fontWeight: '600' }}>YOUR QUEUE TICKET</Text>
          <Text style={{ color: colors.primaryText, fontSize: 48, fontWeight: '800' }}>#{activeQueue.queueNumber}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ backgroundColor: colors.card, borderRadius: radius.pill }}>
              <StatusBadge status={activeQueue.status} />
            </View>
            {activeQueue.status === 'waiting' ? (
              <Text style={{ color: colors.primaryText, fontWeight: '600' }}>
                {activeQueue.patientsAhead} ahead of you
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      <SectionTitle>Next appointment</SectionTitle>
      {data?.next ? (
        <PressableCard
          accent={statusColor(data.next.status)}
          onPress={() => router.push({ pathname: '/student/appointments/[id]', params: { id: data.next!.id } })}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <DateBlock date={toClinicParts(data.next.appointmentDate).date} />
            <View style={{ flex: 1 }}>
              <CardTitle>{data.next.service?.name || 'Appointment'}</CardTitle>
              <Muted>
                {formatTime(toClinicParts(data.next.appointmentDate).time)} · {doctorName(data.next)}
              </Muted>
              <View style={{ marginTop: 6 }}>
                <StatusBadge status={data.next.status} />
              </View>
            </View>
          </View>
        </PressableCard>
      ) : (
        <Card>
          <EmptyState icon="calendar-outline" title="No upcoming appointments" message="Book a visit with the clinic." />
        </Card>
      )}
      <Button title="Book an appointment" icon="add-circle-outline" onPress={() => router.navigate('/student/appointments/book')} />

      <SectionTitle>My health</SectionTitle>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <QuickAction icon="document-text-outline" label="Medical history" href="/medical-history" />
        <QuickAction icon="medical-outline" label="Prescriptions" href="/prescriptions" />
        <QuickAction icon="person-outline" label="Profile" href="/student/profile" />
      </View>

      {data && data.unread > 0 ? (
        <>
          <SectionTitle>Alerts</SectionTitle>
          <PressableCard onPress={() => router.navigate('/student/notifications')}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="notifications" size={20} color={colors.primary} style={{ marginRight: space.sm }} />
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>
                {data.unread} unread notification{data.unread === 1 ? '' : 's'}
              </Text>
            </View>
          </PressableCard>
        </>
      ) : null}
    </Screen>
  );
}
