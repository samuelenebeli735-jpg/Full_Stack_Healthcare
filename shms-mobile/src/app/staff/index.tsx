import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { dashboard } from '@/api/staff';
import { displayName, useAuth } from '@/auth/AuthContext';
import { Button, ErrorBanner, Loading, Screen, SectionTitle, StatCard, Title, space, statusLabel } from '@/components/ui';
import { useFocusData } from '@/lib/useAsync';

export default function StaffHome() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';
  const { data, error, loading, reload } = useFocusData(() => dashboard(orgId), 30000);

  if (loading && !data) return <Loading />;

  const q = (status: string) => data?.queueStatusCounts.find((s) => s.status === status)?.count ?? 0;
  const scheduled = data?.appointmentStatusCounts.find((s) => s.status === 'scheduled')?.count;

  return (
    <Screen onRefresh={reload}>
      <Title subtitle={user?.organization?.name}>Hello, {displayName(user)}</Title>
      <ErrorBanner message={error} />

      <SectionTitle>Queue now</SectionTitle>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <StatCard highlight icon="hourglass-outline" label={statusLabel('waiting')} value={q('waiting')} />
        <View style={{ flex: 1 }}>
          <StatCard icon="megaphone-outline" label={statusLabel('called')} value={q('called')} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <StatCard icon="medkit-outline" label={statusLabel('in_progress')} value={q('in_progress')} />
        <StatCard icon="calendar-outline" label="Appointments today" value={data?.counts.appointmentsToday ?? '—'} />
      </View>

      <Button title="Open the queue" icon="people-outline" onPress={() => router.navigate('/staff/queue' as Href)} />
      <Button
        title={scheduled ? `Appointments (${scheduled} awaiting confirmation)` : 'Appointments'}
        variant="secondary"
        icon="calendar-outline"
        onPress={() => router.navigate('/staff/appointments')}
      />
      <Button title="Patients" variant="secondary" icon="search-outline" onPress={() => router.navigate('/staff/patients' as Href)} />
    </Screen>
  );
}
