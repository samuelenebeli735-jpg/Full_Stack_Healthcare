import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { availableDoctors, slots as loadSlots, type AvailableDoctor } from '@/api/student';
import { Chip, EmptyState, Muted, SectionTitle, colors, space, styles, type } from '@/components/ui';
import { clinicNowTime, clinicToday, formatClinicDate, formatTime, nextClinicDates } from '@/lib/clinicTime';

/** A selectable card with a radio indicator. */
function Option({
  title,
  subtitle,
  meta,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
        pressed && !selected && { backgroundColor: colors.divider },
        disabled && { opacity: 0.55 },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={22}
          color={selected ? colors.primary : '#94A3B8'}
          style={{ marginRight: space.md }}
        />
        <View style={{ flex: 1 }}>
          <Text style={[type.cardTitle, selected && { color: colors.primary }]}>{title}</Text>
          {subtitle ? <Muted>{subtitle}</Muted> : null}
        </View>
        {meta ? <Text style={[type.caption, { marginLeft: space.sm }]}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
}

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
    <Option
      key={d.id}
      selected={doctorChoice === d.id}
      disabled={!d.hasAvailableSlots}
      onPress={() => setDoctorChoice(d.id)}
      title={`Dr ${d.firstName} ${d.lastName}${d.id === currentDoctorId ? ' (current)' : ''}`}
      subtitle={[d.qualification, d.department?.name].filter(Boolean).join(' · ') || 'Doctor'}
      meta={d.hasAvailableSlots ? `${d.availableSlotCount} free` : 'Fully booked'}
    />
  );

  return (
    <>
      <SectionTitle>{stepOffset}. Date</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {BOOKING_DATES.map((d) => (
          <Chip key={d} label={formatClinicDate(d)} selected={d === date} onPress={() => setDate(d)} />
        ))}
      </View>
      <Muted style={{ marginBottom: 4 }}>Appointments can be booked up to 2 days ahead.</Muted>

      <SectionTitle>{stepOffset + 1}. Doctor</SectionTitle>
      {doctors === null ? (
        <ActivityIndicator color={colors.primary} />
      ) : doctors.length === 0 ? (
        <EmptyState icon="person-outline" title="No doctors available" message={doctorsMessage || 'Choose another date.'} />
      ) : (
        <>
          <Option
            selected={doctorChoice === ANY}
            onPress={() => setDoctorChoice(ANY)}
            title="No preference"
            subtitle={
              doctorChoice === ANY
                ? firstAvailable
                  ? `First available doctor: Dr ${firstAvailable.firstName} ${firstAvailable.lastName}`
                  : 'No doctor has a free time on this date. Choose another date.'
                : 'The first available doctor on this date'
            }
          />
          {doctors.map(doctorCard)}
        </>
      )}

      {doctor ? (
        <>
          <SectionTitle>{stepOffset + 2}. Time</SectionTitle>
          {times === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : times.length === 0 ? (
            <EmptyState icon="time-outline" title="No free times" message={timesMessage || 'Choose another date or doctor.'} />
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
