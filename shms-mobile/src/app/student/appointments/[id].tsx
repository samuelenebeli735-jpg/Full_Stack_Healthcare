import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { cancelAppointment, checkIn, myAppointments } from '@/api/student';
import {
  Banner,
  Button,
  Card,
  CardTitle,
  DateBlock,
  EmptyState,
  ErrorBanner,
  InfoRow,
  Loading,
  Muted,
  Screen,
  SectionTitle,
  StatusBadge,
  TextField,
  colors,
  space,
  statusColor,
} from '@/components/ui';
import { doctorName } from '@/lib/appointments';
import { clinicToday, formatClinicDateTime, toClinicParts } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

/** Shows a recorded value; nothing when the field was not recorded. */
function Recorded({ label, value }: { label: string; value?: string | null }) {
  return value ? <InfoRow label={label} value={value} /> : null;
}

export default function AppointmentDetail() {
  const { id, booked } = useLocalSearchParams<{ id: string; booked?: string }>();
  // Students have no single-appointment endpoint; read it from their own list.
  const { data, error, loading, reload } = useFocusData(async () => (await myAppointments()).find((a) => a.id === id) ?? null);

  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && data === undefined) return <Loading />;
  if (!data) {
    return (
      <Screen>
        <ErrorBanner message={error} />
        <EmptyState icon="calendar-outline" title="Appointment not found" />
      </Screen>
    );
  }

  const a = data;
  const { date } = toClinicParts(a.appointmentDate);
  const isToday = date === clinicToday();
  const canCancel = a.status === 'scheduled' || a.status === 'confirmed';
  const canCheckIn = a.status === 'confirmed' && isToday && !a.queue;
  const consultation = a.queue?.consultation;
  const prescription = consultation?.prescription;

  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      after?.();
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={reload}>
      {booked ? (
        <Banner tone="success" title="Appointment booked.">
          The clinic will confirm it; you can check in on the day once it is confirmed.
        </Banner>
      ) : null}
      <ErrorBanner message={actionError || error} />

      <Card accent={statusColor(a.status)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
          <DateBlock date={date} />
          <View style={{ flex: 1 }}>
            <CardTitle>{a.service?.name || 'Appointment'}</CardTitle>
            <View style={{ marginTop: 6 }}>
              <StatusBadge status={a.status} />
            </View>
          </View>
        </View>
        <InfoRow label="When" value={formatClinicDateTime(a.appointmentDate)} />
        <InfoRow label="Doctor" value={doctorName(a)} />
        <Recorded label="Reason" value={a.reason} />
        <Recorded label="Queue ticket" value={a.queue ? `#${a.queue.queueNumber}` : null} />
      </Card>

      {canCheckIn ? (
        <Button
          title="Check in now"
          icon="log-in-outline"
          loading={busy}
          onPress={() => void run(() => checkIn(a.id), () => router.navigate('/student/queue'))}
        />
      ) : null}
      {a.status === 'scheduled' && isToday ? (
        <Banner tone="warning">Waiting for the clinic to confirm this appointment before you can check in.</Banner>
      ) : null}
      {a.status === 'confirmed' && !isToday ? (
        <Banner tone="info">You can check in on the day of the appointment.</Banner>
      ) : null}
      {a.queue && (a.status === 'checked_in' || a.status === 'in_progress') ? (
        <Button title="View queue status" variant="secondary" icon="people-outline" onPress={() => router.navigate('/student/queue')} />
      ) : null}

      {consultation ? (
        <>
          <SectionTitle>Visit summary</SectionTitle>
          <Card>
            <Recorded label="Complaint" value={consultation.chiefComplaint} />
            <Recorded label="Diagnosis" value={consultation.diagnosis} />
            <Recorded label="Treatment plan" value={consultation.treatmentPlan} />
            <Recorded label="Notes" value={consultation.notes} />
            {!consultation.chiefComplaint && !consultation.diagnosis && !consultation.treatmentPlan && !consultation.notes ? (
              <Muted>No notes recorded.</Muted>
            ) : null}
          </Card>
        </>
      ) : null}

      {prescription && prescription.items.length ? (
        <>
          <SectionTitle>Prescription</SectionTitle>
          <Card>
            {prescription.items.map((it, i) => (
              <View
                key={it.id}
                style={i ? { marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.divider } : undefined}>
                <CardTitle>{it.medicationName}</CardTitle>
                <Muted>
                  {it.dosage} · {it.frequency} · {it.duration} · Qty {it.quantity}
                </Muted>
                {it.instructions ? <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{it.instructions}</Text> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {canCancel && !cancelling ? (
        <>
          <SectionTitle>Manage</SectionTitle>
          <Button
            title="Reschedule"
            variant="secondary"
            icon="calendar-outline"
            onPress={() => router.push({ pathname: '/student/appointments/reschedule', params: { id: a.id } })}
          />
          <Button title="Cancel appointment" variant="secondary" icon="close-circle-outline" onPress={() => setCancelling(true)} />
        </>
      ) : null}
      {canCancel && cancelling ? (
        <Card>
          <TextField label="Reason for cancelling" value={reason} onChangeText={setReason} maxLength={500} required />
          <Button
            title="Confirm cancellation"
            variant="danger"
            loading={busy}
            disabled={!reason.trim()}
            onPress={() => void run(() => cancelAppointment(a.id, reason.trim()), () => setCancelling(false))}
          />
          <Button title="Keep appointment" variant="link" onPress={() => setCancelling(false)} />
        </Card>
      ) : null}
    </Screen>
  );
}
