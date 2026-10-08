import { Stack, router } from 'expo-router';
import { Text, View } from 'react-native';

import { myAppointments, type Appointment, type PrescriptionItem } from '@/api/student';
import { RoleGate } from '@/components/RoleGate';
import {
  Button,
  Card,
  CardTitle,
  DateBlock,
  EmptyState,
  ErrorBanner,
  IconCircle,
  Loading,
  Muted,
  Screen,
  Title,
  colors,
  space,
} from '@/components/ui';
import { formatClinicDateTime, toClinicParts } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

interface PrescriptionEntry {
  id: string;
  date: string;
  appointment: Appointment;
  items: PrescriptionItem[];
}

/** Prescriptions from the student's visits (as the web Pharmacy page). */
async function loadPrescriptions(): Promise<PrescriptionEntry[]> {
  const all = await myAppointments();
  const out: PrescriptionEntry[] = [];
  for (const a of all) {
    const rx = a.queue?.consultation?.prescription;
    if (rx && rx.items.length) {
      out.push({ id: rx.id, date: rx.createdAt || a.appointmentDate, appointment: a, items: rx.items });
    }
  }
  return out.sort((x, y) => y.date.localeCompare(x.date));
}

function Prescriptions() {
  const { data, error, loading, reload } = useFocusData(loadPrescriptions);

  if (loading && !data) return <Loading />;

  return (
    <Screen onRefresh={reload}>
      <Title subtitle="Medicines prescribed at your visits">Prescriptions</Title>
      <ErrorBanner message={error} />
      {!data || data.length === 0 ? (
        error ? null : (
          <Card>
            <EmptyState icon="medical-outline" title="No prescriptions" message="Medicines prescribed at your visits will appear here." />
          </Card>
        )
      ) : (
        data.map((rx) => {
          const a = rx.appointment;
          return (
            <Card key={rx.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
                <DateBlock date={toClinicParts(rx.date).date} />
                <View style={{ flex: 1 }}>
                  {/* The schema records no prescriber; the visit's doctor is only who it was booked with. */}
                  <CardTitle>Prescriber: Not recorded</CardTitle>
                  {a.staff ? (
                    <Muted>
                      Booked with Dr {a.staff.firstName} {a.staff.lastName}
                    </Muted>
                  ) : null}
                </View>
              </View>
              {rx.items.map((it) => (
                <View
                  key={it.id}
                  style={{ flexDirection: 'row', paddingTop: space.md, marginTop: space.sm, borderTopWidth: 1, borderTopColor: colors.divider }}>
                  <IconCircle name="medical" size={32} color={colors.accent} bg={colors.accentSoft} />
                  <View style={{ flex: 1, marginLeft: space.md }}>
                    <CardTitle>{it.medicationName}</CardTitle>
                    <Muted>
                      {it.dosage} · {it.frequency} · {it.duration} · Qty {it.quantity}
                    </Muted>
                    {it.instructions ? <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{it.instructions}</Text> : null}
                  </View>
                </View>
              ))}
              <Button
                title={`Visit: ${a.service?.name || 'Appointment'} · ${formatClinicDateTime(a.appointmentDate)}`}
                variant="link"
                size="sm"
                onPress={() => router.push({ pathname: '/student/appointments/[id]', params: { id: a.id } })}
              />
            </Card>
          );
        })
      )}
    </Screen>
  );
}

export default function PrescriptionsScreen() {
  return (
    <RoleGate role="student">
      <Stack.Screen options={{ headerShown: true, title: 'Prescriptions' }} />
      <Prescriptions />
    </RoleGate>
  );
}
