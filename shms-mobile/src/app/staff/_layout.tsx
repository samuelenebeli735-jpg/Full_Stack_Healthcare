import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { RoleGate } from '@/components/RoleGate';
import { colors } from '@/components/ui';

export default function StaffLayout() {
  return (
    <RoleGate role="staff">
      <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}>
        <Tabs.Screen
          name="index"
          options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: 'More', tabBarIcon: ({ color, size }) => <Ionicons name="menu" color={color} size={size} /> }}
        />
      </Tabs>
    </RoleGate>
  );
}
