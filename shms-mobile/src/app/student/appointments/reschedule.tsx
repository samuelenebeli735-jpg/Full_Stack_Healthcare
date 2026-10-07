import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { myAppointments, rescheduleAppointment } from '@/api/student';
import { SlotPicker, type SlotChoice } from '@/components/SlotPicker';
import { Button, Card, EmptyState, ErrorBanner, Loading, Muted, Screen, SectionTitle, colors } from '@/components/ui';
import { doctorName } from '@/lib/appointments';
import { formatClinicDate, formatClinicDateTime, formatTime, fromClinicParts } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

/** Move an appointment to another date/time and, optionally, another doctor. */
export default function Reschedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Students have no single-appointment endpoint; read it from their own list.
  const { data: appt, error, loading } = useFocusData(async () => (await myAppointments()).find((a) => a.id === id) ?? null);
  const [choice, setChoice] = useState<SlotChoice | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && appt === undefined) return <Loading />;
  if (!appt) {
    return (
      <Screen>
        <ErrorBanner message={error} />
        <EmptyState title="Appointment not found" />
      </Screen>
    );
  }

  const confirm = async () => {
    if (!choice) return;
    setBusy(true);
    setActionError(null);
    try {
      await rescheduleAppointment(appt.id, fromClinicParts(choice.date, choice.time), choice.doctor.id);
      // The detail screen reloads when it regains focus, showing the new time.
      router.back();
    } catch (e) {
      // e.g. the time was just taken, or the appointment's status changed.
      setActionError(e instanceof Error ? e.message : 'Could not reschedule the appointment.');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ErrorBanner message={actionError || error} />
      <Card>
        <Muted>Current appointment</Muted>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{appt.service?.name || 'Appointment'}</Text>
        <Muted>{formatClinicDateTime(appt.appointmentDate)}</Muted>
        <Muted>{doctorName(appt)}</Muted>
      </Card>

      {appt.serviceId ? (
        <SlotPicker serviceId={appt.serviceId} currentDoctorId={appt.staffId} onChange={setChoice} onError={setActionError} />
      ) : null}

      {choice ? (
        <>
          <SectionTitle>Review</SectionTitle>
          <Card>
            <Muted>New time</Muted>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
              {formatClinicDate(choice.date)} at {formatTime(choice.time)}
            </Text>
            <Muted>
              Dr {choice.doctor.firstName} {choice.doctor.lastName}
              {choice.firstAvailable ? ' (first available)' : ''}
            </Muted>
          </Card>
          <Button title="Confirm new time" onPress={() => void confirm()} loading={busy} />
        </>
      ) : null}
    </Screen>
  );
}
