import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { BrandHeader, Button, Card, ErrorBanner, Muted, Screen, TextField, space } from '@/components/ui';

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
        <BrandHeader subtitle="Student Health Management System" />
        <Card>
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
          <Button title="Sign in" icon="log-in-outline" onPress={() => void submit()} loading={busy} />
          <Button title="Forgot password?" variant="link" onPress={() => router.push('/forgot-password')} />
        </Card>
        <View style={{ alignItems: 'center', marginTop: space.sm }}>
          <Muted>New student?</Muted>
        </View>
        <Button title="Create a student account" variant="secondary" icon="person-add-outline" onPress={() => router.push('/register')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
