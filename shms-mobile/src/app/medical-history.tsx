import { Stack, router } from 'expo-router';
import { View } from 'react-native';

import { myAppointments, type Appointment } from '@/api/student';
import { RoleGate } from '@/components/RoleGate';
import {
  Card,
  CardTitle,
  DateBlock,
  EmptyState,
  ErrorBanner,
  InfoRow,
  Loading,
  Muted,
  PressableCard,
  Screen,
  Title,
} from '@/components/ui';
import { formatTime, toClinicParts } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

/** Completed visits and what was recorded at them (as the web Medical Records page). */
async function loadHistory(): Promise<Appointment[]> {
  const all = await myAppointments();
  return all
    .filter((a) => a.status === 'completed')
    .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate));
}

function Recorded({ label, value }: { label: string; value?: string | null }) {
  return value ? <InfoRow label={label} value={value} /> : null;
}

function History() {
  const { data, error, loading, reload } = useFocusData(loadHistory);

  if (loading && !data) return <Loading />;

  return (
    <Screen onRefresh={reload}>
      <Title subtitle="Your completed visits and what was recorded">Medical history</Title>
      <ErrorBanner message={error} />
      {!data || data.length === 0 ? (
        error ? null : (
          <Card>
            <EmptyState
              icon="document-text-outline"
              title="No medical records yet"
              message="Your records will appear here after your first completed visit."
            />
          </Card>
        )
      ) : (
        data.map((a) => {
          const c = a.queue?.consultation;
          const { date, time } = toClinicParts(a.appointmentDate);
          const items = c?.prescription?.items.length ?? 0;
          return (
            <PressableCard
              key={a.id}
              onPress={() => router.push({ pathname: '/student/appointments/[id]', params: { id: a.id } })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <DateBlock date={date} />
                <View style={{ flex: 1 }}>
                  <CardTitle>{a.service?.name || 'Visit'}</CardTitle>
                  <Muted>
                    {formatTime(time)} · {a.staff ? `Dr ${a.staff.firstName} ${a.staff.lastName}` : 'Doctor not recorded'}
                  </Muted>
                </View>
              </View>
              {c ? (
                <>
                  <Recorded label="Complaint" value={c.chiefComplaint} />
                  <Recorded label="Diagnosis" value={c.diagnosis} />
                  <Recorded label="Treatment plan" value={c.treatmentPlan} />
                  <Recorded label="Notes" value={c.notes} />
                  {!c.chiefComplaint && !c.diagnosis && !c.treatmentPlan && !c.notes ? <Muted>No notes recorded.</Muted> : null}
                </>
              ) : (
                <Muted>No consultation notes recorded.</Muted>
              )}
              {items ? (
                <Muted>
                  {items} medication{items === 1 ? '' : 's'} prescribed
                </Muted>
              ) : null}
            </PressableCard>
          );
        })
      )}
    </Screen>
  );
}

export default function MedicalHistory() {
  return (
    <RoleGate role="student">
      <Stack.Screen options={{ headerShown: true, title: 'Medical history' }} />
      <History />
    </RoleGate>
  );
}
