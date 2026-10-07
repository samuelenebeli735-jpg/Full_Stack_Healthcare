import { useState } from 'react';
import { Text } from 'react-native';

import { patientRecords } from '@/api/staff';
import { Button, Card, EmptyState, ErrorBanner, Muted, Screen, TextField, Title, colors } from '@/components/ui';
import { patientFacts, patientName } from '@/lib/patients';

type Records = Awaited<ReturnType<typeof patientRecords>>;

export default function Patients() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Records | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await patientRecords(query.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Patients</Title>
      <TextField
        label="Name, matric number or record number"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={() => void search()}
      />
      <Button title="Search" onPress={() => void search()} loading={busy} />
      <ErrorBanner message={error} />
      {result ? (
        result.items.length === 0 ? (
          <EmptyState title="No patients found" />
        ) : (
          <>
            <Muted>
              {result.pagination.total} record{result.pagination.total === 1 ? '' : 's'}
              {result.pagination.total > result.items.length ? ` (showing ${result.items.length})` : ''}
            </Muted>
            {result.items.map((r) => (
              <Card key={r.id}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{patientName(r.profile)}</Text>
                <Muted>{[r.profile?.matricNumber, r.recordNumber].filter(Boolean).join(' · ')}</Muted>
                <Muted>{patientFacts(r.profile)}</Muted>
                <Muted>{[r.profile?.faculty, r.profile?.department, r.profile?.level ? `${r.profile.level} level` : null].filter(Boolean).join(' · ')}</Muted>
                {r.profile?.phone ? <Muted>Phone: {r.profile.phone}</Muted> : null}
                {r.profile?.allergies ? <Text style={{ color: colors.danger }}>Allergies: {r.profile.allergies}</Text> : null}
                {r.status === 'archived' ? <Muted>Record archived</Muted> : null}
              </Card>
            ))}
          </>
        )
      ) : null}
    </Screen>
  );
}
