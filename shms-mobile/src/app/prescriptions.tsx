import { Stack, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { myAppointments, type Appointment, type PrescriptionItem } from '@/api/student';
import { RoleGate } from '@/components/RoleGate';
import { Card, EmptyState, ErrorBanner, Loading, Muted, Screen, colors } from '@/components/ui';
import { formatClinicDate, formatClinicDateTime, toClinicParts } from '@/lib/clinicTime';
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
      <ErrorBanner message={error} />
      {!data || data.length === 0 ? (
        error ? null : <EmptyState title="No prescriptions" message="Medicines prescribed at your visits will appear here." />
      ) : (
        data.map((rx) => {
          const a = rx.appointment;
          return (
            <Card key={rx.id}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                {formatClinicDate(toClinicParts(rx.date).date)}
              </Text>
              {/* The schema records no prescriber; the visit's doctor is only who it was booked with. */}
              <Muted>Prescriber: Not recorded</Muted>
              {a.staff ? (
                <Muted>
                  Booked with Dr {a.staff.firstName} {a.staff.lastName}
                </Muted>
              ) : null}
              <Pressable onPress={() => router.push({ pathname: '/student/appointments/[id]', params: { id: a.id } })}>
                <Text style={{ color: colors.primary, marginTop: 4 }}>
                  Visit: {a.service?.name || 'Appointment'} · {formatClinicDateTime(a.appointmentDate)}
                </Text>
              </Pressable>
              {rx.items.map((it) => (
                <View
                  key={it.id}
                  style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{it.medicationName}</Text>
                  <Muted>
                    {it.dosage} · {it.frequency} · {it.duration} · Qty {it.quantity}
                  </Muted>
                  {it.instructions ? <Muted>{it.instructions}</Muted> : null}
                </View>
              ))}
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
      <Stack.Screen options={{ headerShown: true, title: 'Prescriptions', headerTintColor: colors.primary }} />
      <Prescriptions />
    </RoleGate>
  );
}
