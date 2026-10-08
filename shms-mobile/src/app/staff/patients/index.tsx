import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { patientRecords, recentPatientRecords, type PatientRecord } from '@/api/staff';
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorBanner,
  IconCircle,
  Loading,
  Muted,
  Pill,
  PressableCard,
  Screen,
  SectionTitle,
  TextField,
  Title,
  colors,
  space,
} from '@/components/ui';
import { patientFacts, patientName } from '@/lib/patients';
import { useFocusData } from '@/lib/useAsync';

type Records = Awaited<ReturnType<typeof patientRecords>>;

function RecordRow({ r }: { r: PatientRecord }) {
  return (
    <PressableCard onPress={() => router.push({ pathname: '/staff/patients/[id]', params: { id: r.id } })}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconCircle name="person-outline" />
        <View style={{ flex: 1, marginLeft: space.md }}>
          <CardTitle>{patientName(r.profile)}</CardTitle>
          <Muted>{[r.profile?.matricNumber, r.recordNumber].filter(Boolean).join(' · ')}</Muted>
          <Muted>{patientFacts(r.profile)}</Muted>
          {r.profile?.allergies ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="warning" size={13} color={colors.danger} style={{ marginRight: 4 }} />
              <Text style={{ color: colors.danger, fontSize: 13 }}>Allergies: {r.profile.allergies}</Text>
            </View>
          ) : null}
          {r.status === 'archived' ? <Pill>Record archived</Pill> : null}
        </View>
      </View>
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
      <Button title="Search" icon="search-outline" onPress={() => void search()} loading={busy} />
      <ErrorBanner message={error} />

      {result ? (
        <>
          <SectionTitle>Search results</SectionTitle>
          {result.items.length === 0 ? (
            <Card>
              <EmptyState icon="search-outline" title="No patients found" message="Check the spelling or try the matric number." />
            </Card>
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
          <Button title="Clear search" variant="link" onPress={() => { setQuery(''); setResult(null); }} />
        </>
      ) : (
        <>
          <SectionTitle>Recent patient records</SectionTitle>
          <ErrorBanner message={recent.error} />
          {recent.loading && !recent.data ? (
            <Loading />
          ) : !recent.data || recent.data.items.length === 0 ? (
            recent.error ? null : (
              <Card>
                <EmptyState icon="folder-open-outline" title="No patient records yet" message="A record is created at a student's first booking." />
              </Card>
            )
          ) : (
            recent.data.items.map((r) => <RecordRow key={r.id} r={r} />)
          )}
        </>
      )}
    </Screen>
  );
}
