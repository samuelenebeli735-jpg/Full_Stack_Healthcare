import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { getPreferences, savePreferences, type NotificationPreferences } from '@/api/notifications';
import { useAuth } from '@/auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  ErrorBanner,
  Loading,
  Muted,
  Screen,
  SectionTitle,
  TextField,
  colors,
} from '@/components/ui';

const HOURS = [1, 2, 6, 12, 24, 48];

function Toggle({ label, value, onChange, note }: { label: string; value: boolean; onChange: (v: boolean) => void; note?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
        {note ? <Muted>{note}</Muted> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} />
    </View>
  );
}

/** Reminder settings (same fields and the same honest notice as the web page). */
export default function NotificationPreferencesScreen() {
  const { status } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPreferences()
      .then((p) => {
        setPrefs(p);
        setPhone(p.phone ?? '');
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (status !== 'signedIn') return <Redirect href="/" />;

  const set = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    setSaved(false);
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
  };

  const save = async () => {
    if (!prefs) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await savePreferences({ ...prefs, phone: phone.trim() || null });
      setPrefs(result);
      setPhone(result.phone ?? '');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Reminder settings', headerTintColor: colors.primary }} />
      {!prefs && !error ? (
        <Loading />
      ) : (
        <Screen>
          <Card>
            <Text style={{ fontWeight: '700', color: colors.text }}>Reminder delivery is not available yet.</Text>
            <Muted>
              Email, WhatsApp and Telegram reminders are not sent by SHMS yet, so no automatic appointment reminder will
              arrive. Your choices below are saved for when delivery is added. In-app notifications (the Alerts tab) work
              today.
            </Muted>
          </Card>
          <ErrorBanner message={error} />
          {prefs ? (
            <>
              <SectionTitle>Channels</SectionTitle>
              <Card>
                <Toggle label="Email" note="Not available yet" value={prefs.emailEnabled} onChange={(v) => set('emailEnabled', v)} />
                <Toggle label="WhatsApp" note="Not available yet" value={prefs.whatsappEnabled} onChange={(v) => set('whatsappEnabled', v)} />
                <Toggle label="Telegram" note="Not available yet" value={prefs.telegramEnabled} onChange={(v) => set('telegramEnabled', v)} />
              </Card>
              <TextField
                label="Phone number (WhatsApp)"
                value={phone}
                onChangeText={(v) => {
                  setSaved(false);
                  setPhone(v);
                }}
                keyboardType="phone-pad"
              />

              <SectionTitle>Remind before appointment</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {HOURS.map((h) => (
                  <Chip
                    key={h}
                    label={`${h} hour${h === 1 ? '' : 's'}`}
                    selected={prefs.remindBeforeHours === h}
                    onPress={() => set('remindBeforeHours', h)}
                  />
                ))}
              </View>

              <SectionTitle>Remind for</SectionTitle>
              <Card>
                <Toggle label="Appointments" value={prefs.remindForAppointment} onChange={(v) => set('remindForAppointment', v)} />
                <Toggle label="Queue updates" value={prefs.remindForQueue} onChange={(v) => set('remindForQueue', v)} />
                <Toggle label="Lab results" value={prefs.remindForResults} onChange={(v) => set('remindForResults', v)} />
              </Card>

              {saved ? <Text style={{ color: colors.success, fontWeight: '600', marginBottom: 6 }}>Settings saved.</Text> : null}
              <Button title="Save settings" onPress={() => void save()} loading={busy} />
            </>
          ) : null}
        </Screen>
      )}
    </>
  );
}
