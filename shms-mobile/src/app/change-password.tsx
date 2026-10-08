import { Redirect, Stack, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { changePassword } from '@/api/auth';
import { useAuth } from '@/auth/AuthContext';
import { Banner, Button, Card, ErrorBanner, Screen, TextField } from '@/components/ui';

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
      <Stack.Screen options={{ headerShown: true, title: 'Change password' }} />
      <Screen>
        {done ? (
          <>
            <Banner tone="success" title="Password changed.">Use the new password the next time you sign in.</Banner>
            <Button title="Done" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Card>
              <ErrorBanner message={error} />
              <TextField label="Current password" value={current} onChangeText={setCurrent} secureTextEntry required />
              <TextField label="New password" value={next} onChangeText={setNext} secureTextEntry required helper="At least 8 characters." />
              <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry required />
              <Button title="Change password" icon="key-outline" onPress={() => void submit()} loading={busy} />
            </Card>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
