import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button, ErrorBanner, Muted, Screen, TextField, Title, colors } from '@/components/ui';

export default function Login() {
  const { status, signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'signedIn') return <Redirect href="/" />;

  const submit = async () => {
    if (!identifier.trim() || !password) {
      setError('Enter your email or matric/staff number and your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier, password);
      // The entry gate routes by role once the session is set.
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary, marginTop: 40 }}>SHMS</Text>
        <Title>Sign in</Title>
        <Muted>Student Health Management System</Muted>
        <Text style={{ height: 20 }} />
        <ErrorBanner message={error} />
        <TextField
          label="Email, matric number or staff number"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <Button title="Sign in" onPress={() => void submit()} loading={busy} />
        <Button title="Forgot password?" variant="secondary" onPress={() => router.push('/forgot-password')} />
        <Button title="New student? Create an account" variant="secondary" onPress={() => router.push('/register')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
