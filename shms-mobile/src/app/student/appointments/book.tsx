import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { bookAppointment, ensureMedicalRecordId, services as loadServices, type Service } from '@/api/student';
import { useAuth } from '@/auth/AuthContext';
import { SlotPicker, type SlotChoice } from '@/components/SlotPicker';
import { Banner, Button, Card, CardTitle, Chip, EmptyState, ErrorBanner, InfoRow, Screen, SectionTitle, TextField, colors } from '@/components/ui';
import { formatClinicDate, formatTime, fromClinicParts } from '@/lib/clinicTime';

export default function BookAppointment() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';

  const [serviceList, setServiceList] = useState<Service[] | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [choice, setChoice] = useState<SlotChoice | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Services of the student's clinic.
  useEffect(() => {
    loadServices(orgId)
      .then((list) => {
        setServiceList(list);
        if (list.length === 1) setServiceId(list[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, [orgId]);

  const book = async () => {
    if (!serviceId || !choice) return;
    setBusy(true);
    setError(null);
    try {
      const medicalRecordId = await ensureMedicalRecordId();
      const created = await bookAppointment({
        organizationId: orgId,
        medicalRecordId,
        serviceId,
        // A real doctor even for "No preference" (the first available one).
        staffId: choice.doctor.id,
        appointmentDate: fromClinicParts(choice.date, choice.time),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      router.replace({ pathname: '/student/appointments/[id]', params: { id: created.id, booked: '1' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed.');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ErrorBanner message={error} />

      <SectionTitle>1. Service</SectionTitle>
      {serviceList === null ? (
        <ActivityIndicator color={colors.primary} />
      ) : serviceList.length === 0 ? (
        <EmptyState icon="medkit-outline" title="No services yet" message="The clinic has not set up any services." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {serviceList.map((s) => (
            <Chip key={s.id} label={s.name} selected={s.id === serviceId} onPress={() => setServiceId(s.id)} />
          ))}
        </View>
      )}

      {serviceId ? (
        <SlotPicker key={serviceId} serviceId={serviceId} onChange={setChoice} onError={setError} stepOffset={2} />
      ) : null}

      {choice ? (
        <>
          <SectionTitle>5. Reason (optional)</SectionTitle>
          <TextField
            label="What is the visit about?"
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <SectionTitle>Review</SectionTitle>
          <Card accent={colors.primary}>
            <CardTitle>{serviceList?.find((s) => s.id === serviceId)?.name || 'Appointment'}</CardTitle>
            <InfoRow label="When" value={`${formatClinicDate(choice.date)} at ${formatTime(choice.time)}`} />
            <InfoRow
              label="Doctor"
              value={`Dr ${choice.doctor.firstName} ${choice.doctor.lastName}${choice.firstAvailable ? ' (first available)' : ''}`}
            />
          </Card>
          <Banner tone="info">The clinic confirms your appointment before you can check in.</Banner>
          <Button title="Book appointment" icon="checkmark-circle-outline" onPress={() => void book()} loading={busy} />
        </>
      ) : null}
    </Screen>
  );
}
