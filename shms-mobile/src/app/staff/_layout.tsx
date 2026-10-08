import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { RoleGate } from '@/components/RoleGate';
import { tabScreenOptions } from '@/components/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;

export default function StaffLayout() {
  return (
    <RoleGate role="staff">
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
        <Tabs.Screen name="queue" options={{ title: 'Queue', tabBarIcon: icon('people') }} />
        <Tabs.Screen name="appointments" options={{ title: 'Appointments', tabBarIcon: icon('calendar') }} />
        <Tabs.Screen name="patients" options={{ title: 'Patients', tabBarIcon: icon('search') }} />
        <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: icon('notifications') }} />
        <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu') }} />
      </Tabs>
    </RoleGate>
  );
}
