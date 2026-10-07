import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import {
  completeVisit,
  consultationForQueue,
  createConsultation,
  createPrescription,
  prescriptionForConsultation,
  queueEntry,
  skipPatient,
  startVisit,
  updateConsultation,
  updatePrescription,
  type Consultation,
  type ConsultationFields,
  type NewPrescriptionItem,
  type Prescription,
} from '@/api/staff';
import { useAuth } from '@/auth/AuthContext';
import {
  Button,
  Card,
  ErrorBanner,
  Loading,
  Muted,
  Screen,
  SectionTitle,
  StatusBadge,
  TextField,
  colors,
} from '@/components/ui';
import { formatClinicDateTime } from '@/lib/clinicTime';
import { patientFacts, patientName } from '@/lib/patients';
import { useFocusData } from '@/lib/useAsync';

const FIELDS: { key: keyof ConsultationFields; label: string; max: number }[] = [
  { key: 'chiefComplaint', label: 'Chief complaint', max: 1000 },
  { key: 'symptoms', label: 'Symptoms', max: 2000 },
  { key: 'diagnosis', label: 'Diagnosis', max: 1000 },
  { key: 'treatmentPlan', label: 'Treatment plan', max: 2000 },
  { key: 'notes', label: 'Notes', max: 2000 },
];

const EMPTY_ITEM = { medicationName: '', dosage: '', frequency: '', duration: '', quantity: '', instructions: '' };

async function loadVisit(id: string) {
  const entry = await queueEntry(id);
  const consultation = await consultationForQueue(id);
  const prescription = consultation ? await prescriptionForConsultation(consultation.id) : null;
  return { entry, consultation, prescription };
}

export default function Visit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';
  const { data, error, loading, reload } = useFocusData(() => loadVisit(id));

  const [form, setForm] = useState<Record<keyof ConsultationFields, string>>({
    chiefComplaint: '',
    symptoms: '',
    diagnosis: '',
    treatmentPlan: '',
    notes: '',
  });
  const [items, setItems] = useState<NewPrescriptionItem[]>([]);
  const [draft, setDraft] = useState(EMPTY_ITEM);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load saved consultation/prescription into the editors.
  const consultation: Consultation | null = data?.consultation ?? null;
  const prescription: Prescription | null = data?.prescription ?? null;
  useEffect(() => {
    if (!data) return;
    const c = data.consultation;
    setForm({
      chiefComplaint: c?.chiefComplaint ?? '',
      symptoms: c?.symptoms ?? '',
      diagnosis: c?.diagnosis ?? '',
      treatmentPlan: c?.treatmentPlan ?? '',
      notes: c?.notes ?? '',
    });
    setItems(
      (data.prescription?.items ?? []).map((it) => ({
        medicationName: it.medicationName,
        dosage: it.dosage,
        frequency: it.frequency,
        duration: it.duration,
        quantity: it.quantity,
        instructions: it.instructions ?? undefined,
      }))
    );
  }, [data]);

  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <Screen>
        <ErrorBanner message={error || 'Visit not found.'} />
      </Screen>
    );
  }

  const { entry } = data;
  const profile = entry.appointment?.medicalRecord?.profile;
  const inProgress = entry.status === 'in_progress';

  const run = async (label: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    setActionError(null);
    setMessage(null);
    try {
      await action();
      if (done) setMessage(done);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusy(null);
    }
  };

  const saveConsultation = () => {
    // The API rejects empty strings; send only filled-in fields.
    const fields: Partial<ConsultationFields> = {};
    for (const f of FIELDS) {
      const v = form[f.key].trim();
      if (v) fields[f.key] = v;
    }
    return run(
      'consultation',
      () => (consultation ? updateConsultation(consultation.id, fields) : createConsultation(entry.id, fields)),
      'Consultation saved.'
    );
  };

  const addItem = () => {
    const quantity = Number.parseInt(draft.quantity, 10);
    if (!draft.medicationName.trim() || !draft.dosage.trim() || !draft.frequency.trim() || !draft.duration.trim()) {
      setActionError('Medication, dosage, frequency and duration are required.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setActionError('Quantity must be a whole number of at least 1.');
      return;
    }
    setActionError(null);
    setItems((prev) => [
      ...prev,
      {
        medicationName: draft.medicationName.trim(),
        dosage: draft.dosage.trim(),
        frequency: draft.frequency.trim(),
        duration: draft.duration.trim(),
        quantity,
        ...(draft.instructions.trim() ? { instructions: draft.instructions.trim() } : {}),
      },
    ]);
    setDraft(EMPTY_ITEM);
  };

  const savePrescription = () => {
    if (!consultation) {
      setActionError('Save the consultation first.');
      return;
    }
    if (!items.length) {
      setActionError('Add at least one medication.');
      return;
    }
    return run(
      'prescription',
      () => (prescription ? updatePrescription(prescription.id, items) : createPrescription(consultation.id, items)),
      'Prescription saved.'
    );
  };

  const confirmSkip = () =>
    Alert.alert('Skip patient?', `Ticket #${entry.queueNumber} will be closed and marked as missed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Skip',
        style: 'destructive',
        onPress: () => void run('skip', () => skipPatient(orgId, entry.id)).then(() => router.back()),
      },
    ]);

  const confirmComplete = () =>
    Alert.alert('Complete visit?', 'The visit will be closed. Make sure the consultation and prescription are saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => void run('complete', () => completeVisit(entry.id), 'Visit completed.') },
    ]);

  return (
    <Screen onRefresh={reload}>
      <ErrorBanner message={actionError || error} />
      {message ? (
        <Card>
          <Text style={{ color: colors.success, fontWeight: '600' }}>{message}</Text>
        </Card>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>#{entry.queueNumber}</Text>
          <StatusBadge status={entry.status} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 8 }}>{patientName(profile)}</Text>
        <Muted>{[profile?.matricNumber, entry.appointment?.medicalRecord?.recordNumber].filter(Boolean).join(' · ')}</Muted>
        <Muted>{patientFacts(profile)}</Muted>
        {profile?.allergies ? (
          <Text style={{ color: colors.danger, marginTop: 6 }}>Allergies: {profile.allergies}</Text>
        ) : null}
        <View style={{ height: 8 }} />
        <Muted>Service: {entry.appointment?.service?.name || '—'}</Muted>
        {entry.appointment?.appointmentDate ? <Muted>Booked for {formatClinicDateTime(entry.appointment.appointmentDate)}</Muted> : null}
        {entry.appointment?.reason ? <Muted>Reason: {entry.appointment.reason}</Muted> : null}
      </Card>

      {entry.status === 'waiting' ? <Muted>This patient is waiting. Use “Call next” on the queue to call them.</Muted> : null}

      {entry.status === 'called' ? (
        <>
          <Button title="Start consultation" loading={busy === 'start'} onPress={() => void run('start', () => startVisit(entry.id))} />
          <Button title="Skip (not present)" variant="secondary" loading={busy === 'skip'} onPress={confirmSkip} />
        </>
      ) : null}

      {inProgress || consultation ? (
        <>
          <SectionTitle>Consultation</SectionTitle>
          {FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              value={form[f.key]}
              onChangeText={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
              maxLength={f.max}
              multiline
              editable={inProgress}
              style={{ minHeight: 60, textAlignVertical: 'top' }}
            />
          ))}
          {inProgress ? (
            <Button
              title={consultation ? 'Update consultation' : 'Save consultation'}
              loading={busy === 'consultation'}
              onPress={() => void saveConsultation()}
            />
          ) : null}
        </>
      ) : null}

      {consultation ? (
        <>
          <SectionTitle>Prescription</SectionTitle>
          {items.length === 0 ? <Muted>No medication added.</Muted> : null}
          {items.map((it, i) => (
            <Card key={`${it.medicationName}-${i}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 }}>{it.medicationName}</Text>
                {inProgress ? (
                  <Pressable onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))}>
                    <Text style={{ color: colors.danger, fontWeight: '600' }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
              <Muted>
                {it.dosage} · {it.frequency} · {it.duration} · Qty {it.quantity}
              </Muted>
              {it.instructions ? <Muted>{it.instructions}</Muted> : null}
            </Card>
          ))}
          {inProgress ? (
            <Card>
              <TextField label="Medication" value={draft.medicationName} onChangeText={(v) => setDraft({ ...draft, medicationName: v })} />
              <TextField label="Dosage (e.g. 500 mg)" value={draft.dosage} onChangeText={(v) => setDraft({ ...draft, dosage: v })} />
              <TextField label="Frequency (e.g. twice daily)" value={draft.frequency} onChangeText={(v) => setDraft({ ...draft, frequency: v })} />
              <TextField label="Duration (e.g. 5 days)" value={draft.duration} onChangeText={(v) => setDraft({ ...draft, duration: v })} />
              <TextField label="Quantity" value={draft.quantity} keyboardType="number-pad" onChangeText={(v) => setDraft({ ...draft, quantity: v })} />
              <TextField label="Instructions (optional)" value={draft.instructions} onChangeText={(v) => setDraft({ ...draft, instructions: v })} />
              <Button title="Add medication" variant="secondary" onPress={addItem} />
            </Card>
          ) : null}
          {inProgress ? (
            <Button
              title={prescription ? 'Update prescription' : 'Save prescription'}
              loading={busy === 'prescription'}
              disabled={!items.length}
              onPress={() => void savePrescription()}
            />
          ) : null}
        </>
      ) : null}

      {inProgress ? (
        <>
          <View style={{ height: 16 }} />
          <Button title="Complete visit" variant="danger" loading={busy === 'complete'} onPress={confirmComplete} />
        </>
      ) : null}
    </Screen>
  );
}
