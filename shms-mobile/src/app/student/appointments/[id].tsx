import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { cancelAppointment, checkIn, myAppointments } from '@/api/student';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Loading,
  Muted,
  Screen,
  SectionTitle,
  StatusBadge,
  TextField,
  colors,
} from '@/components/ui';
import { doctorName } from '@/lib/appointments';
import { clinicToday, formatClinicDateTime, toClinicParts } from '@/lib/clinicTime';
import { useFocusData } from '@/lib/useAsync';

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 15, color: colors.text }}>{value}</Text>
    </View>
  );
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
        <EmptyState title="Appointment not found" />
      </Screen>
    );
  }

  const a = data;
  const isToday = toClinicParts(a.appointmentDate).date === clinicToday();
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
        <Card>
          <Text style={{ color: colors.success, fontWeight: '600' }}>Appointment booked.</Text>
          <Muted>The clinic will confirm it; you can check in on the day once it is confirmed.</Muted>
        </Card>
      ) : null}
      <ErrorBanner message={actionError || error} />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 }}>{a.service?.name || 'Appointment'}</Text>
          <StatusBadge status={a.status} />
        </View>
        <Row label="When" value={formatClinicDateTime(a.appointmentDate)} />
        <Row label="Doctor" value={doctorName(a)} />
        <Row label="Reason" value={a.reason} />
        <Row label="Queue ticket" value={a.queue ? `#${a.queue.queueNumber}` : null} />
      </Card>

      {canCheckIn ? (
        <Button
          title="Check in now"
          loading={busy}
          onPress={() => void run(() => checkIn(a.id), () => router.navigate('/student/queue'))}
        />
      ) : null}
      {a.status === 'scheduled' && isToday ? (
        <Muted>Waiting for the clinic to confirm this appointment before you can check in.</Muted>
      ) : null}
      {a.status === 'confirmed' && !isToday ? <Muted>You can check in on the day of the appointment.</Muted> : null}
      {a.queue && (a.status === 'checked_in' || a.status === 'in_progress') ? (
        <Button title="View queue status" variant="secondary" onPress={() => router.navigate('/student/queue')} />
      ) : null}

      {consultation ? (
        <>
          <SectionTitle>Visit summary</SectionTitle>
          <Card>
            <Row label="Complaint" value={consultation.chiefComplaint} />
            <Row label="Diagnosis" value={consultation.diagnosis} />
            <Row label="Treatment plan" value={consultation.treatmentPlan} />
            <Row label="Notes" value={consultation.notes} />
          </Card>
        </>
      ) : null}

      {prescription && prescription.items.length ? (
        <>
          <SectionTitle>Prescription</SectionTitle>
          {prescription.items.map((it) => (
            <Card key={it.id}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{it.medicationName}</Text>
              <Muted>
                {it.dosage} · {it.frequency} · {it.duration} · Qty {it.quantity}
              </Muted>
              {it.instructions ? <Muted>{it.instructions}</Muted> : null}
            </Card>
          ))}
        </>
      ) : null}

      {canCancel ? (
        cancelling ? (
          <Card>
            <TextField label="Reason for cancelling" value={reason} onChangeText={setReason} maxLength={500} />
            <Button
              title="Confirm cancellation"
              variant="danger"
              loading={busy}
              disabled={!reason.trim()}
              onPress={() => void run(() => cancelAppointment(a.id, reason.trim()), () => setCancelling(false))}
            />
            <Button title="Keep appointment" variant="secondary" onPress={() => setCancelling(false)} />
          </Card>
        ) : (
          <Button title="Cancel appointment" variant="secondary" onPress={() => setCancelling(true)} />
        )
      ) : null}
    </Screen>
  );
}
