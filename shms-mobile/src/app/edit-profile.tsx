import { Redirect, Stack, router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { BLOOD_GROUPS, GENDERS, GENOTYPES, LEVELS, updateMyProfile, type ProfileUpdate } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import {
  Banner,
  Button,
  ChoiceField,
  ErrorBanner,
  Screen,
  SectionTitle,
  TextField,
  fieldErrorMap,
} from '@/components/ui';
import { isValidDate } from '@/lib/validation';

const FIELDS = [
  'firstName',
  'middleName',
  'lastName',
  'faculty',
  'department',
  'level',
  'gender',
  'dateOfBirth',
  'phone',
  'emergencyContactName',
  'emergencyContactPhone',
  'bloodGroup',
  'genotype',
  'allergies',
] as const;
type Key = (typeof FIELDS)[number];
type Form = Record<Key, string>;

export default function EditProfile() {
  const { status, user, refresh } = useAuth();
  const p = user?.profile;
  const initial: Form = Object.fromEntries(
    FIELDS.map((k) => {
      const v = (p as Record<string, unknown> | null | undefined)?.[k];
      // Stored dates come back as ISO timestamps; the form edits YYYY-MM-DD.
      return [k, typeof v === 'string' ? (k === 'dateOfBirth' ? v.slice(0, 10) : v) : ''];
    })
  ) as Form;

  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status !== 'signedIn' || user?.role !== 'student') return <Redirect href="/" />;

  const set = (key: Key) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const field = (key: Key, label: string, props: Partial<ComponentProps<typeof TextField>> = {}) => (
    <TextField label={label} value={form[key]} onChangeText={set(key)} error={errors[key]} {...props} />
  );

  const save = async () => {
    const e: Record<string, string> = {};
    const t = (k: Key) => form[k].trim();
    if (t('firstName').length < 2) e.firstName = 'First name is required.';
    if (t('lastName').length < 2) e.lastName = 'Last name is required.';
    if (t('faculty').length < 2) e.faculty = 'Faculty is required.';
    if (t('department').length < 2) e.department = 'Department is required.';
    if (t('dateOfBirth') && !isValidDate(t('dateOfBirth'))) e.dateOfBirth = 'Use the format YYYY-MM-DD.';
    if (t('phone').length < 10) e.phone = 'Enter a valid phone number.';
    if (t('emergencyContactName').length < 2) e.emergencyContactName = 'Emergency contact name is required.';
    if (t('emergencyContactPhone').length < 10) e.emergencyContactPhone = 'Enter a valid emergency contact phone.';
    setErrors(e);
    if (Object.keys(e).length) {
      setError('Please correct the highlighted fields.');
      return;
    }

    // Send only what changed. Choice fields cannot be cleared (the API only
    // accepts listed values); free-text optional fields can be emptied.
    const body: ProfileUpdate = {};
    for (const k of FIELDS) {
      const value = t(k);
      if (value === (initial[k] ?? '').trim()) continue;
      if (!value && (k === 'bloodGroup' || k === 'genotype' || k === 'level' || k === 'gender')) continue;
      (body as Record<string, string>)[k] = value;
    }
    if (!Object.keys(body).length) {
      router.back();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await updateMyProfile(body);
      await refresh();
      router.back();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(fieldErrorMap(err.fieldErrors));
        setError(err.message);
      } else {
        setError('Could not save your profile.');
      }
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: 'Edit profile' }} />
      <Screen>
        <ErrorBanner message={error} />
        <Banner tone="info">Email and matric number cannot be changed here.</Banner>

        <SectionTitle>Personal details</SectionTitle>
        {field('firstName', 'First name')}
        {field('middleName', 'Middle name (optional)')}
        {field('lastName', 'Last name')}
        <ChoiceField label="Gender" options={GENDERS} value={form.gender} onChange={set('gender')} error={errors.gender} />
        {field('dateOfBirth', 'Date of birth (YYYY-MM-DD)', { keyboardType: 'numbers-and-punctuation' })}
        {field('phone', 'Phone number', { keyboardType: 'phone-pad' })}

        <SectionTitle>Studies</SectionTitle>
        {field('faculty', 'Faculty')}
        {field('department', 'Department')}
        <ChoiceField label="Level" options={LEVELS} value={form.level} onChange={set('level')} error={errors.level} />

        <SectionTitle>Emergency contact</SectionTitle>
        {field('emergencyContactName', 'Contact name')}
        {field('emergencyContactPhone', 'Contact phone', { keyboardType: 'phone-pad' })}

        <SectionTitle>Health</SectionTitle>
        <ChoiceField label="Blood group" options={BLOOD_GROUPS} value={form.bloodGroup} onChange={set('bloodGroup')} />
        <ChoiceField label="Genotype" options={GENOTYPES} value={form.genotype} onChange={set('genotype')} />
        {field('allergies', 'Allergies', { multiline: true })}

        <Button title="Save changes" icon="save-outline" onPress={() => void save()} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
