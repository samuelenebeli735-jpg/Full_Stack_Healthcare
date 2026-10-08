import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/components/ui';

export default function PatientsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Patient' }} />
    </Stack>
  );
}
