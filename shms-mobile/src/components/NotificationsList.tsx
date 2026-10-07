import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { markAllNotificationsRead, markNotificationRead, notifications } from '@/api/student';
import { Button, EmptyState, ErrorBanner, Loading, Muted, PressableCard, Screen, Title, colors } from '@/components/ui';
import { formatClinicDateTime } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

/**
 * The signed-in user's in-app notifications (GET /notifications returns only
 * the caller's own), shared by the student and staff Alerts tabs.
 */
export function NotificationsList() {
  const { data, error, loading, reload } = useFocusData(() => notifications(1));

  if (loading && !data) return <Loading />;

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <Screen onRefresh={reload}>
      <Title>Alerts</Title>
      <ErrorBanner message={error} />
      {unread > 0 ? (
        <Button
          title={`Mark all ${unread} as read`}
          variant="secondary"
          onPress={() => void markAllNotificationsRead().then(reload)}
        />
      ) : null}
      <Button title="Reminder settings" variant="secondary" onPress={() => router.push('/notification-preferences')} />
      <View style={{ height: 12 }} />
      {items.length === 0 ? (
        error ? null : <EmptyState title="No notifications" />
      ) : (
        items.map((n) => (
          <PressableCard
            key={n.id}
            onPress={() => {
              if (!n.read) void markNotificationRead(n.id).then(reload);
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {!n.read ? (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginRight: 8 }} />
              ) : null}
              <Text style={{ flex: 1, fontSize: 15, fontWeight: n.read ? '500' : '700', color: colors.text }}>{n.title}</Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.text, marginTop: 4 }}>{n.message}</Text>
            <Muted>{formatClinicDateTime(n.createdAt)}</Muted>
          </PressableCard>
        ))
      )}
      {data && data.pagination.total > items.length ? (
        <Muted>
          Showing the latest {items.length} of {data.pagination.total}.
        </Muted>
      ) : null}
    </Screen>
  );
}
