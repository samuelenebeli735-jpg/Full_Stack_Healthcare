import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { markAllNotificationsRead, markNotificationRead, notifications } from '@/api/student';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  IconCircle,
  Loading,
  Muted,
  PressableCard,
  Screen,
  Title,
  colors,
  space,
  type IconName,
} from '@/components/ui';
import { formatClinicDateTime } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

// Icons for the notification types the API sends; anything else gets a bell.
const TYPE_ICONS: Record<string, IconName> = {
  appointment: 'calendar-outline',
  queue: 'people-outline',
  consultation: 'medkit-outline',
  prescription: 'medical-outline',
  pharmacy: 'medical-outline',
  reminder: 'alarm-outline',
  system: 'settings-outline',
};

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
      <Title subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}>Alerts</Title>
      <ErrorBanner message={error} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: space.sm }}>
        {unread > 0 ? (
          <Button
            title="Mark all as read"
            size="sm"
            variant="secondary"
            icon="checkmark-done-outline"
            onPress={() => void markAllNotificationsRead().then(reload)}
          />
        ) : null}
        <Button
          title="Reminder settings"
          size="sm"
          variant="secondary"
          icon="settings-outline"
          onPress={() => router.push('/notification-preferences')}
        />
      </View>
      {items.length === 0 ? (
        error ? null : (
          <Card>
            <EmptyState icon="notifications-outline" title="No notifications" message="Updates about your visits will appear here." />
          </Card>
        )
      ) : (
        items.map((n) => (
          <PressableCard
            key={n.id}
            chevron={false}
            accent={n.read ? undefined : colors.primary}
            onPress={() => {
              if (!n.read) void markNotificationRead(n.id).then(reload);
            }}>
            <View style={{ flexDirection: 'row' }}>
              <IconCircle
                name={TYPE_ICONS[n.type] ?? 'notifications-outline'}
                size={36}
                color={n.read ? colors.muted : colors.primary}
                bg={n.read ? colors.neutralBg : colors.primarySoft}
              />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={{ fontSize: 15, fontWeight: n.read ? '500' : '700', color: colors.text }}>{n.title}</Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 2, lineHeight: 20 }}>{n.message}</Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                  {formatClinicDateTime(n.createdAt)}
                  {n.read ? '' : ' · Unread'}
                </Text>
              </View>
            </View>
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
