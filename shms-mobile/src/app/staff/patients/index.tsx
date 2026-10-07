import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { patientRecords, recentPatientRecords, type PatientRecord } from '@/api/staff';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Loading,
  Muted,
  PressableCard,
  Screen,
  SectionTitle,
  TextField,
  Title,
  colors,
} from '@/components/ui';
import { patientFacts, patientName } from '@/lib/patients';
import { useFocusData } from '@/lib/useAsync';

type Records = Awaited<ReturnType<typeof patientRecords>>;

function RecordRow({ r }: { r: PatientRecord }) {
  return (
    <PressableCard onPress={() => router.push({ pathname: '/staff/patients/[id]', params: { id: r.id } })}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{patientName(r.profile)}</Text>
      <Muted>{[r.profile?.matricNumber, r.recordNumber].filter(Boolean).join(' · ')}</Muted>
      <Muted>{patientFacts(r.profile)}</Muted>
      {r.profile?.allergies ? <Text style={{ color: colors.danger }}>Allergies: {r.profile.allergies}</Text> : null}
      {r.status === 'archived' ? <Muted>Record archived</Muted> : null}
    </PressableCard>
  );
}

export default function Patients() {
  const recent = useFocusData(recentPatientRecords);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Records | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) {
      setResult(null);
      return;
    }
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
    <Screen onRefresh={recent.reload}>
      <Title>Patients</Title>
      <TextField
        label="Name, matric number or record number"
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          if (!v.trim()) setResult(null);
        }}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={() => void search()}
      />
      <Button title="Search" onPress={() => void search()} loading={busy} />
      <ErrorBanner message={error} />

      {result ? (
        <>
          <SectionTitle>Search results</SectionTitle>
          {result.items.length === 0 ? (
            <EmptyState title="No patients found" />
          ) : (
            <>
              <Muted>
                {result.pagination.total} record{result.pagination.total === 1 ? '' : 's'}
                {result.pagination.total > result.items.length ? ` (showing ${result.items.length})` : ''}
              </Muted>
              {result.items.map((r) => (
                <RecordRow key={r.id} r={r} />
              ))}
            </>
          )}
          <Button title="Clear search" variant="secondary" onPress={() => { setQuery(''); setResult(null); }} />
        </>
      ) : (
        <>
          <SectionTitle>Recent patient records</SectionTitle>
          <ErrorBanner message={recent.error} />
          {recent.loading && !recent.data ? (
            <Loading />
          ) : !recent.data || recent.data.items.length === 0 ? (
            recent.error ? null : <EmptyState title="No patient records yet" />
          ) : (
            recent.data.items.map((r) => <RecordRow key={r.id} r={r} />)
          )}
        </>
      )}
    </Screen>
  );
}
