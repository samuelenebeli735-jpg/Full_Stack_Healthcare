import { Text, View } from 'react-native';

import { myQueue } from '@/api/student';
import { Card, EmptyState, ErrorBanner, Loading, Muted, Screen, StatusBadge, Title, colors } from '@/components/ui';
import { useFocusData } from '@/lib/useAsync';

const MESSAGES: Record<string, string> = {
  waiting: 'Please wait in the clinic. You will be called soon.',
  called: 'You have been called. Please go to the consultation room now.',
  in_progress: 'You are with the doctor.',
  completed: 'Your visit is complete.',
  cancelled: 'This queue ticket was closed.',
};

export default function StudentQueue() {
  // Refresh every 10 s while this screen is open.
  const { data: q, error, loading, reload } = useFocusData(myQueue, 10000);

  if (loading && q === undefined) return <Loading />;

  return (
    <Screen onRefresh={reload}>
      <Title>Queue</Title>
      <ErrorBanner message={error} />
      {!q ? (
        <EmptyState
          title="You are not in the queue"
          message="Check in from a confirmed appointment on the day of your visit."
        />
      ) : (
        <>
          <Card>
            <Muted>Your ticket</Muted>
            <Text style={{ fontSize: 56, fontWeight: '800', color: colors.primary }}>#{q.queueNumber}</Text>
            <StatusBadge status={q.status} />
            <Text style={{ marginTop: 12, fontSize: 15, color: colors.text }}>{MESSAGES[q.status] || ''}</Text>
          </Card>
          {q.status === 'waiting' ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Card>
                  <Muted>Now serving</Muted>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>
                    {q.currentServing ? `#${q.currentServing.queueNumber}` : '—'}
                  </Text>
                </Card>
              </View>
              <View style={{ flex: 1 }}>
                <Card>
                  <Muted>Ahead of you</Muted>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>{q.patientsAhead}</Text>
                </Card>
              </View>
            </View>
          ) : null}
          {q.status === 'waiting' && q.estimatedWaitMinutes > 0 ? (
            <Muted>Estimated wait: about {q.estimatedWaitMinutes} minutes.</Muted>
          ) : null}
          <Muted>This screen updates automatically.</Muted>
        </>
      )}
    </Screen>
  );
}
