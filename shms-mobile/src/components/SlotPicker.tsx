import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { availableDoctors, slots as loadSlots, type AvailableDoctor } from '@/api/student';
import { Chip, EmptyState, Muted, PressableCard, SectionTitle, colors } from '@/components/ui';
import { clinicNowTime, clinicToday, formatClinicDate, formatTime, nextClinicDates } from '@/lib/clinicTime';

/** The API accepts appointments up to 2 days ahead (today included). */
export const BOOKING_DATES = nextClinicDates(3);

const ANY = 'any';

export interface SlotChoice {
  date: string;
  time: string;
  /** Always a real doctor: "No preference" resolves to the first available one. */
  doctor: AvailableDoctor;
  firstAvailable: boolean;
}

/**
 * Date → doctor (or "No preference") → free time, shared by booking and
 * rescheduling. Reports a complete choice, or null while incomplete.
 */
export function SlotPicker({
  serviceId,
  currentDoctorId,
  onChange,
  onError,
  stepOffset = 1,
}: {
  serviceId: string;
  /** Rescheduling: the appointment's doctor, preselected when free that day. */
  currentDoctorId?: string | null;
  onChange: (choice: SlotChoice | null) => void;
  onError: (message: string) => void;
  /** Number of the first step heading shown here. */
  stepOffset?: number;
}) {
  const [date, setDate] = useState<string>(BOOKING_DATES[0]);
  const [doctors, setDoctors] = useState<AvailableDoctor[] | null>(null);
  const [doctorsMessage, setDoctorsMessage] = useState<string | null>(null);
  const [doctorChoice, setDoctorChoice] = useState<string | null>(null); // doctor id or ANY
  const [times, setTimes] = useState<string[] | null>(null);
  const [timesMessage, setTimesMessage] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  // Doctors working on the chosen date (the API lists those with free slots first).
  useEffect(() => {
    let live = true;
    setDoctors(null);
    setDoctorChoice(null);
    setTimes(null);
    setTime(null);
    availableDoctors(date, serviceId)
      .then((res) => {
        if (!live) return;
        setDoctors(res.doctors);
        setDoctorsMessage(res.message);
        const current = res.doctors.find((d) => d.id === currentDoctorId && d.hasAvailableSlots);
        if (current) setDoctorChoice(current.id);
      })
      .catch((e: Error) => live && onError(e.message));
    return () => {
      live = false;
    };
  }, [date, serviceId, currentDoctorId, onError]);

  // "No preference" = the first doctor with free slots, as on the web.
  const firstAvailable = doctors?.find((d) => d.hasAvailableSlots) ?? null;
  const doctor =
    doctorChoice === ANY ? firstAvailable : (doctors?.find((d) => d.id === doctorChoice) ?? null);

  // Free times of the resolved doctor (past times today are not offered).
  useEffect(() => {
    if (!doctor) return;
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
      .catch((e: Error) => live && onError(e.message));
    return () => {
      live = false;
    };
    // doctor?.id keeps this from re-running on every doctors-list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor?.id, date, serviceId]);

  useEffect(() => {
    onChange(doctor && time ? { date, time, doctor, firstAvailable: doctorChoice === ANY } : null);
  }, [doctor, time, date, doctorChoice, onChange]);

  const doctorCard = (d: AvailableDoctor) => (
    <PressableCard key={d.id} onPress={() => d.hasAvailableSlots && setDoctorChoice(d.id)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: doctorChoice === d.id ? colors.primary : colors.text }}>
            Dr {d.firstName} {d.lastName}
            {d.id === currentDoctorId ? ' (current)' : ''}
          </Text>
          <Muted>{[d.qualification, d.department?.name].filter(Boolean).join(' · ') || 'Doctor'}</Muted>
        </View>
        <Muted>{d.hasAvailableSlots ? `${d.availableSlotCount} free` : 'Fully booked'}</Muted>
      </View>
    </PressableCard>
  );

  return (
    <>
      <SectionTitle>{stepOffset}. Date</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {BOOKING_DATES.map((d) => (
          <Chip key={d} label={formatClinicDate(d)} selected={d === date} onPress={() => setDate(d)} />
        ))}
      </View>
      <Muted>Appointments can be booked up to 2 days ahead.</Muted>

      <SectionTitle>{stepOffset + 1}. Doctor</SectionTitle>
      {doctors === null ? (
        <ActivityIndicator color={colors.primary} />
      ) : doctors.length === 0 ? (
        <EmptyState title="No doctors available" message={doctorsMessage || 'Choose another date.'} />
      ) : (
        <>
          <PressableCard onPress={() => setDoctorChoice(ANY)}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: doctorChoice === ANY ? colors.primary : colors.text }}>
              No preference
            </Text>
            <Muted>
              {doctorChoice === ANY
                ? firstAvailable
                  ? `First available doctor: Dr ${firstAvailable.firstName} ${firstAvailable.lastName}`
                  : 'No doctor has a free time on this date. Choose another date.'
                : 'The first available doctor on this date'}
            </Muted>
          </PressableCard>
          {doctors.map(doctorCard)}
        </>
      )}

      {doctor ? (
        <>
          <SectionTitle>{stepOffset + 2}. Time</SectionTitle>
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
    </>
  );
}
