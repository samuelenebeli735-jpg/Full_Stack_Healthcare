import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/components/ui';

export default function AppointmentsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="book" options={{ title: 'Book appointment' }} />
      <Stack.Screen name="[id]" options={{ title: 'Appointment' }} />
      <Stack.Screen name="reschedule" options={{ title: 'Reschedule' }} />
    </Stack>
  );
}
