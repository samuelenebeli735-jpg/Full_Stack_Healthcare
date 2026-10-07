import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { callNext, todayQueue, type QueueEntry } from '@/api/staff';
import { useAuth } from '@/auth/AuthContext';
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
import { clinicToday } from '@/lib/clinicTime';
import { patientName } from '@/lib/patients';
import { useFocusData } from '@/lib/useAsync';

const ACTIVE = ['called', 'in_progress'];

function ticket(e: QueueEntry): string {
  // A consultation carried over from an earlier day keeps its date in the label.
  const carried = e.queueDate && e.queueDate !== clinicToday();
  return `#${e.queueNumber}${carried ? ` (${e.queueDate.slice(5).replace('-', '/')})` : ''}`;
}

export default function StaffQueue() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';
  const { data, error, loading, reload } = useFocusData(() => todayQueue(orgId), 10000);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;

  const entries = data ?? [];
  const active = entries.filter((e) => ACTIVE.includes(e.status));
  const waiting = entries.filter((e) => e.status === 'waiting').sort((a, b) => a.queueNumber - b.queueNumber);
  const done = entries.filter((e) => e.status === 'completed' || e.status === 'cancelled');

  const next = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const called = await callNext(orgId);
      await reload();
      router.push({ pathname: '/staff/queue/[id]', params: { id: called.id } });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not call the next patient.');
    } finally {
      setBusy(false);
    }
  };

  const row = (e: QueueEntry) => (
    <PressableCard key={e.id} onPress={() => router.push({ pathname: '/staff/queue/[id]', params: { id: e.id } })}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary, width: 76 }}>{ticket(e)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
            {patientName(e.appointment?.medicalRecord?.profile)}
          </Text>
          <Muted>{e.appointment?.service?.name || 'Visit'}</Muted>
        </View>
        <StatusBadge status={e.status} />
      </View>
    </PressableCard>
  );

  return (
    <Screen onRefresh={reload}>
      <Title>Queue</Title>
      <ErrorBanner message={actionError || error} />
      <Button
        title={waiting.length ? `Call next (${waiting.length} waiting)` : 'No one waiting'}
        onPress={() => void next()}
        loading={busy}
        disabled={!waiting.length}
      />
      <SectionTitle>With staff</SectionTitle>
      {active.length ? active.map(row) : <Muted>No patient is called or in consultation.</Muted>}
      <SectionTitle>Waiting</SectionTitle>
      {waiting.length ? waiting.map(row) : <EmptyState title="Nobody is waiting" />}
      {done.length ? (
        <>
          <SectionTitle>Finished today</SectionTitle>
          {done.map(row)}
        </>
      ) : null}
      <Muted>Updates automatically every 10 seconds.</Muted>
    </Screen>
  );
}
