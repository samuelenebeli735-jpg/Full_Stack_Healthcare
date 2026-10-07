import { Stack } from 'expo-router';

import { colors } from '@/components/ui';

export default function AppointmentsLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.card } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="book" options={{ title: 'Book appointment' }} />
      <Stack.Screen name="[id]" options={{ title: 'Appointment' }} />
    </Stack>
  );
}
