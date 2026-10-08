import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { myAppointments, rescheduleAppointment } from '@/api/student';
import { SlotPicker, type SlotChoice } from '@/components/SlotPicker';
import { Button, Card, CardTitle, EmptyState, ErrorBanner, InfoRow, Loading, Screen, SectionTitle, colors } from '@/components/ui';
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
        <EmptyState icon="calendar-outline" title="Appointment not found" />
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
      <SectionTitle>Current appointment</SectionTitle>
      <Card>
        <CardTitle>{appt.service?.name || 'Appointment'}</CardTitle>
        <InfoRow label="When" value={formatClinicDateTime(appt.appointmentDate)} />
        <InfoRow label="Doctor" value={doctorName(appt)} />
      </Card>

      {appt.serviceId ? (
        <SlotPicker serviceId={appt.serviceId} currentDoctorId={appt.staffId} onChange={setChoice} onError={setActionError} />
      ) : null}

      {choice ? (
        <>
          <SectionTitle>Review</SectionTitle>
          <Card accent={colors.primary}>
            <InfoRow label="New time" value={`${formatClinicDate(choice.date)} at ${formatTime(choice.time)}`} />
            <InfoRow
              label="Doctor"
              value={`Dr ${choice.doctor.firstName} ${choice.doctor.lastName}${choice.firstAvailable ? ' (first available)' : ''}`}
            />
          </Card>
          <Button title="Confirm new time" icon="checkmark-circle-outline" onPress={() => void confirm()} loading={busy} />
        </>
      ) : null}
    </Screen>
  );
}
