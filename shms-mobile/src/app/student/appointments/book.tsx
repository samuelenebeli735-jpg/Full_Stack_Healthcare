import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import {
  availableDoctors,
  bookAppointment,
  ensureMedicalRecordId,
  services as loadServices,
  slots as loadSlots,
  type AvailableDoctor,
  type Service,
} from '@/api/student';
import { useAuth } from '@/auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Muted,
  PressableCard,
  Screen,
  SectionTitle,
  TextField,
  colors,
} from '@/components/ui';
import {
  clinicNowTime,
  clinicToday,
  formatClinicDate,
  formatTime,
  fromClinicParts,
  nextClinicDates,
} from '@/lib/clinicTime';

const DATES = nextClinicDates(14);

export default function BookAppointment() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';

  const [serviceList, setServiceList] = useState<Service[] | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(DATES[0]);
  const [doctors, setDoctors] = useState<AvailableDoctor[] | null>(null);
  const [doctorsMessage, setDoctorsMessage] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<AvailableDoctor | null>(null);
  const [times, setTimes] = useState<string[] | null>(null);
  const [timesMessage, setTimesMessage] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
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

  // Doctors working on the chosen date.
  useEffect(() => {
    if (!serviceId) return;
    let live = true;
    setDoctors(null);
    setDoctor(null);
    setTimes(null);
    setTime(null);
    availableDoctors(date, serviceId)
      .then((res) => {
        if (!live) return;
        setDoctors(res.doctors);
        setDoctorsMessage(res.message);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [serviceId, date]);

  // Free slots of the chosen doctor (past times today are not offered).
  useEffect(() => {
    if (!doctor || !serviceId) return;
    let live = true;
    setTimes(null);
    setTime(null);
    loadSlots(doctor.id, date, serviceId)
      .then((res) => {
        if (!live) return;
        const now = date === clinicToday() ? clinicNowTime() : null;
        setTimes(res.slots.filter((s) => s.available && (!now || s.time > now)).map((s) => s.time));
        setTimesMessage(res.message);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [doctor, date, serviceId]);

  const book = async () => {
    if (!serviceId || !doctor || !time) return;
    setBusy(true);
    setError(null);
    try {
      const medicalRecordId = await ensureMedicalRecordId();
      const created = await bookAppointment({
        organizationId: orgId,
        medicalRecordId,
        serviceId,
        staffId: doctor.id,
        appointmentDate: fromClinicParts(date, time),
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
        <EmptyState title="No services yet" message="The clinic has not set up any services." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {serviceList.map((s) => (
            <Chip key={s.id} label={s.name} selected={s.id === serviceId} onPress={() => setServiceId(s.id)} />
          ))}
        </View>
      )}

      {serviceId ? (
        <>
          <SectionTitle>2. Date</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {DATES.map((d) => (
              <Chip key={d} label={formatClinicDate(d)} selected={d === date} onPress={() => setDate(d)} />
            ))}
          </View>

          <SectionTitle>3. Doctor</SectionTitle>
          {doctors === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : doctors.length === 0 ? (
            <EmptyState title="No doctors available" message={doctorsMessage || 'Try another date.'} />
          ) : (
            doctors.map((d) => (
              <PressableCard key={d.id} onPress={() => d.hasAvailableSlots && setDoctor(d)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: doctor?.id === d.id ? colors.primary : colors.text }}>
                      Dr {d.firstName} {d.lastName}
                    </Text>
                    <Muted>{[d.qualification, d.department?.name].filter(Boolean).join(' · ') || 'Doctor'}</Muted>
                  </View>
                  <Muted>{d.hasAvailableSlots ? `${d.availableSlotCount} free` : 'Fully booked'}</Muted>
                </View>
              </PressableCard>
            ))
          )}
        </>
      ) : null}

      {doctor ? (
        <>
          <SectionTitle>4. Time</SectionTitle>
          {times === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : times.length === 0 ? (
            <EmptyState title="No free times" message={timesMessage || 'Choose another date or doctor.'} />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {times.map((t) => (
                <Chip key={t} label={formatTime(t)} selected={t === time} onPress={() => setTime(t)} />
              ))}
            </View>
          )}
        </>
      ) : null}

      {time ? (
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
          <Card>
            <Muted>
              {formatClinicDate(date)} at {formatTime(time)} with Dr {doctor?.firstName} {doctor?.lastName}
            </Muted>
            <Muted>The clinic confirms your appointment before you can check in.</Muted>
          </Card>
          <Button title="Book appointment" onPress={() => void book()} loading={busy} />
        </>
      ) : null}
    </Screen>
  );
}
