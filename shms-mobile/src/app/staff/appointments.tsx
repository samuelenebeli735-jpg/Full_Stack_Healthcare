import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { appointmentsPage, setAppointmentStatus, type OrgAppointment, type StaffAppointmentAction } from '@/api/staff';
import type { Pagination } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import {
  Banner,
  Button,
  Card,
  CardTitle,
  Chip,
  DateBlock,
  EmptyState,
  ErrorBanner,
  Muted,
  Screen,
  SectionTitle,
  StatusBadge,
  TextField,
  Title,
  colors,
  space,
  statusColor,
  statusLabel,
  type IconName,
} from '@/components/ui';
import { addClinicDays, clinicToday, formatClinicDate, formatClinicDateTime, formatTime, toClinicParts } from '@/lib/clinicTime';
import { patientName } from '@/lib/patients';

const STATUSES = ['scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'];

// Staff actions offered before the patient arrives. The API allows these
// transitions (and rejects any other); checked-in and in-progress visits are
// handled through the queue (Skip / Complete).
const ACTIONS: Record<string, StaffAppointmentAction[]> = {
  scheduled: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['cancelled', 'no_show'],
};

const ACTION_LABEL: Record<StaffAppointmentAction, string> = {
  confirmed: 'Confirm',
  cancelled: 'Cancel',
  no_show: 'Mark missed',
};

const ACTION_STYLE: Record<StaffAppointmentAction, { variant: 'primary' | 'secondary' | 'danger'; icon: IconName }> = {
  confirmed: { variant: 'primary', icon: 'checkmark-circle-outline' },
  cancelled: { variant: 'secondary', icon: 'close-circle-outline' },
  no_show: { variant: 'secondary', icon: 'alert-circle-outline' },
};

export default function StaffAppointments() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';

  const [mode, setMode] = useState<'day' | 'all'>('day');
  const [date, setDate] = useState(clinicToday());
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [items, setItems] = useState<OrgAppointment[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seq = useRef(0);

  const filters = { mode, date, status, search: appliedSearch };
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  /** Load page 1 (reset) or the next page of the current filters. */
  const load = useCallback(
    async (page: number) => {
      const f = filtersRef.current;
      const mine = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await appointmentsPage(orgId, {
          date: f.mode === 'day' ? f.date : undefined,
          status: f.status || undefined,
          search: f.search || undefined,
          page,
          order: f.mode === 'day' ? 'asc' : 'desc',
        });
        if (mine !== seq.current) return;
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setPagination(res.pagination);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'Could not load appointments.');
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [orgId]
  );

  // Reload when the screen gains focus or any filter changes.
  useFocusEffect(
    useCallback(() => {
      void load(1);
    }, [load, mode, date, status, appliedSearch])
  );

  const act = (a: OrgAppointment, action: StaffAppointmentAction) => {
    const run = async () => {
      setBusyId(a.id);
      setError(null);
      try {
        await setAppointmentStatus(a.id, action);
        await load(1);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The action failed.');
      } finally {
        setBusyId(null);
      }
    };
    if (action === 'confirmed') return void run();
    const who = patientName(a.medicalRecord?.profile);
    const when = formatClinicDateTime(a.appointmentDate);
    Alert.alert(
      action === 'cancelled' ? 'Cancel appointment?' : 'Mark as missed?',
      `${who}, ${when}. ${action === 'cancelled' ? 'The appointment will be cancelled.' : 'The appointment will be recorded as missed (no-show).'} The student is notified.`,
      [
        { text: 'Back', style: 'cancel' },
        { text: ACTION_LABEL[action], style: 'destructive', onPress: () => void run() },
      ]
    );
  };

  const total = pagination?.total ?? 0;
  const toConfirm = items.filter((a) => a.status === 'scheduled').length;

  return (
    <Screen onRefresh={() => load(1)}>
      <Title>Appointments</Title>

      <View style={{ flexDirection: 'row' }}>
        <Chip label="By day" selected={mode === 'day'} onPress={() => setMode('day')} />
        <Chip label="All dates" selected={mode === 'all'} onPress={() => setMode('all')} />
      </View>

      {mode === 'day' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Chip label="‹ Prev" onPress={() => setDate((d) => addClinicDays(d, -1))} />
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            {formatClinicDate(date)}
          </Text>
          <Chip label="Next ›" onPress={() => setDate((d) => addClinicDays(d, 1))} />
        </View>
      ) : null}
      {mode === 'day' && date !== clinicToday() ? (
        <Chip label="Back to today" onPress={() => setDate(clinicToday())} />
      ) : null}

      <SectionTitle>Status</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip label="All statuses" selected={!status} onPress={() => setStatus('')} />
        {STATUSES.map((s) => (
          <Chip key={s} label={statusLabel(s)} selected={status === s} onPress={() => setStatus(s)} />
        ))}
      </View>

      <TextField
        label="Search patient (name or matric number) or reason"
        value={search}
        onChangeText={(v) => {
          setSearch(v);
          if (!v.trim()) setAppliedSearch('');
        }}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={() => setAppliedSearch(search.trim())}
      />

      <ErrorBanner message={error} />

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar-outline"
            title="No appointments"
            message={mode === 'day' ? `Nothing matches for ${formatClinicDate(date)}.` : 'Nothing matches these filters.'}
          />
        </Card>
      ) : (
        <>
          <Muted style={{ marginBottom: space.sm }}>
            {total} appointment{total === 1 ? '' : 's'}
          </Muted>
          {toConfirm ? (
            <Banner tone="warning">
              {`${toConfirm} awaiting confirmation. Patients can check in only once their appointment is confirmed.`}
            </Banner>
          ) : null}
          {items.map((a) => {
            const { date: d, time } = toClinicParts(a.appointmentDate);
            const actions = ACTIONS[a.status] ?? [];
            return (
              <Card key={a.id} accent={statusColor(a.status)}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <DateBlock date={d} />
                  <View style={{ flex: 1 }}>
                    <CardTitle>{patientName(a.medicalRecord?.profile)}</CardTitle>
                    <Muted>
                      {formatTime(time)} · {a.service?.name || 'Appointment'}
                    </Muted>
                    <Muted>{a.staff ? `Dr ${a.staff.firstName} ${a.staff.lastName}` : 'Any available doctor'}</Muted>
                    <View style={{ marginTop: 6 }}>
                      <StatusBadge status={a.status} />
                    </View>
                  </View>
                </View>
                {a.reason ? <Text style={{ color: colors.textSecondary, marginTop: space.sm }}>Reason: {a.reason}</Text> : null}
                {actions.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm }}>
                    {actions.map((action) => (
                      <Button
                        key={action}
                        size="sm"
                        title={ACTION_LABEL[action]}
                        variant={ACTION_STYLE[action].variant}
                        icon={ACTION_STYLE[action].icon}
                        loading={busyId === a.id && action === 'confirmed'}
                        disabled={busyId !== null}
                        onPress={() => act(a, action)}
                      />
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })}
          {pagination?.hasNextPage ? (
            <Button
              title={`Load more (${items.length} of ${total})`}
              variant="secondary"
              loading={loading}
              onPress={() => void load((pagination?.page ?? 1) + 1)}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
