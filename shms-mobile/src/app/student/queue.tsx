import { Text, View } from 'react-native';

import { myQueue } from '@/api/student';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Loading,
  Muted,
  Screen,
  StatCard,
  StatusBadge,
  Title,
  colors,
  radius,
  space,
} from '@/components/ui';
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
      <Title subtitle="Updates automatically every 10 seconds">Queue</Title>
      <ErrorBanner message={error} />
      {!q ? (
        <Card>
          <EmptyState
            icon="people-outline"
            title="You are not in the queue"
            message="Check in from a confirmed appointment on the day of your visit."
          />
        </Card>
      ) : (
        <>
          <View
            style={{
              backgroundColor: q.status === 'called' ? '#B45309' : colors.primary,
              borderRadius: radius.lg,
              padding: space.xl,
              marginBottom: space.md,
              alignItems: 'center',
            }}>
            <Text style={{ color: '#E6EEF8', fontSize: 13, fontWeight: '700', letterSpacing: 0.8 }}>YOUR TICKET</Text>
            <Text style={{ color: colors.primaryText, fontSize: 64, fontWeight: '800' }}>#{q.queueNumber}</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: radius.pill }}>
              <StatusBadge status={q.status} />
            </View>
            <Text style={{ color: colors.primaryText, fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: space.md }}>
              {MESSAGES[q.status] || ''}
            </Text>
          </View>
          {q.status === 'waiting' ? (
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <StatCard icon="megaphone-outline" label="Now serving" value={q.currentServing ? `#${q.currentServing.queueNumber}` : '—'} />
              <StatCard icon="people-outline" label="Ahead of you" value={q.patientsAhead} />
            </View>
          ) : null}
          {q.status === 'waiting' && q.estimatedWaitMinutes > 0 ? (
            <Muted>Estimated wait: about {q.estimatedWaitMinutes} minutes.</Muted>
          ) : null}
        </>
      )}
    </Screen>
  );
}
