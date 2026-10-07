import { router, type Href } from 'expo-router';
import { Text, View } from 'react-native';

import { dashboard } from '@/api/staff';
import { displayName, useAuth } from '@/auth/AuthContext';
import { Button, Card, ErrorBanner, Loading, Muted, Screen, SectionTitle, Title, colors, statusLabel } from '@/components/ui';
import { useFocusData } from '@/lib/useAsync';

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={{ flex: 1 }}>
      <Card>
        <Muted>{label}</Muted>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>{value}</Text>
      </Card>
    </View>
  );
}

export default function StaffHome() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';
  const { data, error, loading, reload } = useFocusData(() => dashboard(orgId), 30000);

  if (loading && !data) return <Loading />;

  const q = (status: string) => data?.queueStatusCounts.find((s) => s.status === status)?.count ?? 0;

  return (
    <Screen onRefresh={reload}>
      <Title>Hello, {displayName(user)}</Title>
      <Muted>{user?.organization?.name}</Muted>
      <View style={{ height: 12 }} />
      <ErrorBanner message={error} />

      <SectionTitle>Today</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat label="Appointments" value={data?.counts.appointmentsToday ?? '—'} />
        <Stat label={statusLabel('waiting')} value={q('waiting')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat label={statusLabel('called')} value={q('called')} />
        <Stat label={statusLabel('in_progress')} value={q('in_progress')} />
      </View>

      <Button title="Open the queue" onPress={() => router.navigate('/staff/queue' as Href)} />
      <Button title="Today’s appointments" variant="secondary" onPress={() => router.navigate('/staff/appointments')} />
    </Screen>
  );
}
