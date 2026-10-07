import { Redirect, Stack, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';

import { changePassword } from '@/api/auth';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, ErrorBanner, Screen, TextField, colors } from '@/components/ui';

/** Change the signed-in user's password (students and staff). */
export default function ChangePassword() {
  const { status } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status !== 'signedIn') return <Redirect href="/" />;

  const submit = async () => {
    if (!current) return setError('Enter your current password.');
    if (next.length < 8) return setError('The new password must be at least 8 characters.');
    if (next !== confirm) return setError('The new passwords do not match.');
    if (next === current) return setError('Choose a password different from the current one.');
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: 'Change password', headerTintColor: colors.primary }} />
      <Screen>
        {done ? (
          <>
            <Card>
              <Text style={{ color: colors.success, fontWeight: '600' }}>Password changed.</Text>
              <Text style={{ color: colors.text, marginTop: 4 }}>Use the new password the next time you sign in.</Text>
            </Card>
            <Button title="Done" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <ErrorBanner message={error} />
            <TextField label="Current password" value={current} onChangeText={setCurrent} secureTextEntry />
            <TextField label="New password (at least 8 characters)" value={next} onChangeText={setNext} secureTextEntry />
            <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry />
            <Button title="Change password" onPress={() => void submit()} loading={busy} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
