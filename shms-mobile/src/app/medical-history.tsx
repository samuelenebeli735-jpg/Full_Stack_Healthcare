import { Stack, router } from 'expo-router';
import { Text, View } from 'react-native';

import { myAppointments, type Appointment } from '@/api/student';
import { RoleGate } from '@/components/RoleGate';
import { EmptyState, ErrorBanner, Loading, Muted, PressableCard, Screen, colors } from '@/components/ui';
import { formatClinicDateTime } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={{ marginTop: 6 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 15, color: colors.text }}>{value}</Text>
    </View>
  );
}

/** Completed visits and what was recorded at them (as the web Medical Records page). */
async function loadHistory(): Promise<Appointment[]> {
  const all = await myAppointments();
  return all
    .filter((a) => a.status === 'completed')
    .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate));
}

function History() {
  const { data, error, loading, reload } = useFocusData(loadHistory);

  if (loading && !data) return <Loading />;

  return (
    <Screen onRefresh={reload}>
      <ErrorBanner message={error} />
      {!data || data.length === 0 ? (
        error ? null : (
          <EmptyState title="No medical records yet" message="Your records will appear here after your first completed visit." />
        )
      ) : (
        data.map((a) => {
          const c = a.queue?.consultation;
          return (
            <PressableCard
              key={a.id}
              onPress={() => router.push({ pathname: '/student/appointments/[id]', params: { id: a.id } })}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{a.service?.name || 'Visit'}</Text>
              <Muted>{formatClinicDateTime(a.appointmentDate)}</Muted>
              <Muted>{a.staff ? `Dr ${a.staff.firstName} ${a.staff.lastName}` : 'Doctor not recorded'}</Muted>
              {c ? (
                <>
                  <Field label="Complaint" value={c.chiefComplaint} />
                  <Field label="Diagnosis" value={c.diagnosis} />
                  <Field label="Treatment plan" value={c.treatmentPlan} />
                  <Field label="Notes" value={c.notes} />
                  {!c.chiefComplaint && !c.diagnosis && !c.treatmentPlan && !c.notes ? (
                    <Muted>No notes recorded.</Muted>
                  ) : null}
                </>
              ) : (
                <Muted>No consultation notes recorded.</Muted>
              )}
              {c?.prescription?.items.length ? (
                <Muted>
                  {c.prescription.items.length} medication{c.prescription.items.length === 1 ? '' : 's'} prescribed
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
      <Stack.Screen options={{ headerShown: true, title: 'Medical history', headerTintColor: colors.primary }} />
      <History />
    </RoleGate>
  );
}
