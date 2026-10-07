import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { appointmentsOn, confirmAppointment, type OrgAppointment } from '@/api/staff';
import { useAuth } from '@/auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Loading,
  Muted,
  Screen,
  StatusBadge,
  Title,
  colors,
} from '@/components/ui';
import { formatClinicDate, formatTime, nextClinicDates, toClinicParts } from '@/lib/clinicTime';
import { patientName } from '@/lib/patients';
import { useFocusData } from '@/lib/useAsync';

const DATES = nextClinicDates(7);

export default function StaffAppointments() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';
  const [date, setDate] = useState(DATES[0]);
  const { data, error, loading, reload } = useFocusData(() => appointmentsOn(orgId, date));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Focus loads the first date; reload when another date is picked.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void reload();
  }, [date, reload]);
  const pick = (d: string) => setDate(d);

  const confirm = async (a: OrgAppointment) => {
    setBusyId(a.id);
    setActionError(null);
    try {
      await confirmAppointment(a.id);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not confirm.');
    } finally {
      setBusyId(null);
    }
  };

  const list = (data ?? []).filter((a) => toClinicParts(a.appointmentDate).date === date);
  const toConfirm = list.filter((a) => a.status === 'scheduled').length;

  return (
    <Screen onRefresh={reload}>
      <Title>Appointments</Title>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {DATES.map((d) => (
          <Chip key={d} label={formatClinicDate(d)} selected={d === date} onPress={() => pick(d)} />
        ))}
      </View>
      <ErrorBanner message={actionError || error} />
      {loading && !data ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title="No appointments" message={`Nothing booked for ${formatClinicDate(date)}.`} />
      ) : (
        <>
          {toConfirm ? <Muted>{toConfirm} awaiting confirmation. Patients can only check in once confirmed.</Muted> : null}
          <View style={{ height: 8 }} />
          {list.map((a) => (
            <Card key={a.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                    {formatTime(toClinicParts(a.appointmentDate).time)} · {patientName(a.medicalRecord?.profile)}
                  </Text>
                  <Muted>{a.service?.name || 'Appointment'}</Muted>
                  <Muted>{a.staff ? `Dr ${a.staff.firstName} ${a.staff.lastName}` : 'Any available doctor'}</Muted>
                  {a.reason ? <Muted>Reason: {a.reason}</Muted> : null}
                </View>
                <StatusBadge status={a.status} />
              </View>
              {a.status === 'scheduled' ? (
                <Button title="Confirm" loading={busyId === a.id} onPress={() => void confirm(a)} />
              ) : null}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
