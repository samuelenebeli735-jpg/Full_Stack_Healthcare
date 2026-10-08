import Ionicons from '@expo/vector-icons/Ionicons';
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
  Banner,
  Button,
  Card,
  CardTitle,
  ErrorBanner,
  InfoRow,
  Loading,
  Muted,
  Screen,
  SectionTitle,
  StatusBadge,
  TextField,
  colors,
  radius,
  space,
  statusColor,
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
      {message ? <Banner tone="success">{message}</Banner> : null}

      <Card accent={statusColor(entry.status)}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ minWidth: 64, marginRight: space.md, paddingVertical: 8, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary }}>#{entry.queueNumber}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <CardTitle style={{ fontSize: 18 }}>{patientName(profile)}</CardTitle>
            <Muted>{[profile?.matricNumber, entry.appointment?.medicalRecord?.recordNumber].filter(Boolean).join(' · ')}</Muted>
            <View style={{ marginTop: 6 }}>
              <StatusBadge status={entry.status} />
            </View>
          </View>
        </View>
        <View style={{ height: space.md }} />
        <InfoRow label="Patient" value={patientFacts(profile)} />
        <InfoRow label="Service" value={entry.appointment?.service?.name} />
        {entry.appointment?.appointmentDate ? (
          <InfoRow label="Booked for" value={formatClinicDateTime(entry.appointment.appointmentDate)} />
        ) : null}
        {entry.appointment?.reason ? <InfoRow label="Reason" value={entry.appointment.reason} /> : null}
      </Card>
      {profile?.allergies ? <Banner tone="danger" title="Allergies">{profile.allergies}</Banner> : null}

      {entry.status === 'waiting' ? (
        <Banner tone="info">This patient is waiting. Use “Call next” on the queue to call them.</Banner>
      ) : null}

      {entry.status === 'called' ? (
        <>
          <Button
            title="Start consultation"
            icon="play-circle-outline"
            loading={busy === 'start'}
            onPress={() => void run('start', () => startVisit(entry.id))}
          />
          <Button title="Skip (not present)" variant="secondary" icon="play-skip-forward-outline" loading={busy === 'skip'} onPress={confirmSkip} />
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
              icon="save-outline"
              loading={busy === 'consultation'}
              onPress={() => void saveConsultation()}
            />
          ) : null}
        </>
      ) : null}

      {consultation ? (
        <>
          <SectionTitle>Prescription</SectionTitle>
          <Card>
            {items.length === 0 ? <Muted>No medication added.</Muted> : null}
            {items.map((it, i) => (
              <View
                key={`${it.medicationName}-${i}`}
                style={i ? { marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.divider } : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <CardTitle>{it.medicationName}</CardTitle>
                    <Muted>
                      {it.dosage} · {it.frequency} · {it.duration} · Qty {it.quantity}
                    </Muted>
                    {it.instructions ? <Muted>{it.instructions}</Muted> : null}
                  </View>
                  {inProgress ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${it.medicationName}`}
                      onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 4 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      <Text style={{ color: colors.danger, fontWeight: '600', marginLeft: 4 }}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
          {inProgress ? (
            <Card>
              <CardTitle style={{ marginBottom: space.md }}>Add medication</CardTitle>
              <TextField label="Medication" required value={draft.medicationName} onChangeText={(v) => setDraft({ ...draft, medicationName: v })} />
              <TextField label="Dosage" required helper="e.g. 500 mg" value={draft.dosage} onChangeText={(v) => setDraft({ ...draft, dosage: v })} />
              <TextField label="Frequency" required helper="e.g. twice daily" value={draft.frequency} onChangeText={(v) => setDraft({ ...draft, frequency: v })} />
              <TextField label="Duration" required helper="e.g. 5 days" value={draft.duration} onChangeText={(v) => setDraft({ ...draft, duration: v })} />
              <TextField label="Quantity" required value={draft.quantity} keyboardType="number-pad" onChangeText={(v) => setDraft({ ...draft, quantity: v })} />
              <TextField label="Instructions" value={draft.instructions} onChangeText={(v) => setDraft({ ...draft, instructions: v })} />
              <Button title="Add to prescription" variant="secondary" icon="add-circle-outline" onPress={addItem} />
            </Card>
          ) : null}
          {inProgress ? (
            <Button
              title={prescription ? 'Update prescription' : 'Save prescription'}
              icon="save-outline"
              loading={busy === 'prescription'}
              disabled={!items.length}
              onPress={() => void savePrescription()}
            />
          ) : null}
        </>
      ) : null}

      {inProgress ? (
        <>
          <SectionTitle>Finish</SectionTitle>
          <Button title="Complete visit" variant="danger" icon="checkmark-done-outline" loading={busy === 'complete'} onPress={confirmComplete} />
        </>
      ) : null}
    </Screen>
  );
}
