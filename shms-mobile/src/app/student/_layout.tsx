import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { RoleGate } from '@/components/RoleGate';
import { colors } from '@/components/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;

export default function StudentLayout() {
  return (
    <RoleGate role="student">
      <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
        <Tabs.Screen name="appointments" options={{ title: 'Appointments', tabBarIcon: icon('calendar') }} />
        <Tabs.Screen name="queue" options={{ title: 'Queue', tabBarIcon: icon('people') }} />
        <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarIcon: icon('notifications') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person') }} />
      </Tabs>
    </RoleGate>
  );
}
