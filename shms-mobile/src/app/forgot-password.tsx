import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { forgotPassword } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Banner, Button, Card, ErrorBanner, Muted, Screen, TextField } from '@/components/ui';

/** Request a password-reset email; the reset itself happens on the SHMS website. */
export default function ForgotPassword() {
  const { status } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Redirect href="/" />;

  const submit = async () => {
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setError('Enter the email address of your SHMS account.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The server's own wording: it does not reveal whether the account exists.
      setSent((await forgotPassword(value)) || 'If an account exists for this email, a reset link has been sent.');
    } catch (e) {
      // e.g. email delivery is not configured on this server (shown as reported).
      const detail = e instanceof ApiError ? e.fieldErrors[0]?.message : undefined;
      setError(detail || (e instanceof Error ? e.message : 'Could not request a reset link. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: 'Forgot password' }} />
      <Screen>
        {sent ? (
          <Banner tone="success" title={sent}>
            Open the link in the email to choose a new password, then sign in here. The link expires after 1 hour.
          </Banner>
        ) : (
          <>
            <Card>
            <Muted style={{ marginBottom: 12 }}>
              Enter your account email. If email delivery is set up for your clinic, you will receive a link to reset your
              password on the SHMS website.
            </Muted>
            <ErrorBanner message={error} />
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={() => void submit()}
            />
            <Button title="Send reset link" icon="mail-outline" onPress={() => void submit()} loading={busy} />
            </Card>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
