import { Redirect, Stack, router } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';

import {
  BLOOD_GROUPS,
  GENDERS,
  GENOTYPES,
  LEVELS,
  activeOrganizations,
  type RegisterInput,
} from '@/api/auth';
import { ApiError } from '@/api/client';
import type { Organization } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import {
  Button,
  ChoiceField,
  ErrorBanner,
  Screen,
  SectionTitle,
  TextField,
  colors,
  fieldErrorMap,
} from '@/components/ui';
import { isValidDate } from '@/lib/validation';

const EMPTY = {
  organizationId: '',
  email: '',
  password: '',
  confirm: '',
  firstName: '',
  middleName: '',
  lastName: '',
  matricNumber: '',
  faculty: '',
  department: '',
  level: '',
  gender: '',
  dateOfBirth: '',
  phone: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  bloodGroup: '',
  genotype: '',
  allergies: '',
};
type Form = typeof EMPTY;

/** The same rules the API applies (auth.validation.js registerSchema). */
function validate(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  const min = (key: keyof Form, n: number, msg: string) => {
    if (f[key].trim().length < n) e[key] = msg;
  };
  if (!f.organizationId) e.organizationId = 'Choose your institution.';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (f.password.length < 8) e.password = 'Password must be at least 8 characters.';
  if (f.confirm !== f.password) e.confirm = 'Passwords do not match.';
  min('firstName', 2, 'First name is required.');
  min('lastName', 2, 'Last name is required.');
  min('matricNumber', 3, 'Matric number is required.');
  min('faculty', 2, 'Faculty is required.');
  min('department', 2, 'Department is required.');
  if (!f.level) e.level = 'Choose your level.';
  if (!f.gender) e.gender = 'Choose your gender.';
  if (!isValidDate(f.dateOfBirth)) e.dateOfBirth = 'Use the format YYYY-MM-DD, e.g. 2004-06-01.';
  min('phone', 10, 'Enter a valid phone number.');
  min('emergencyContactName', 2, 'Emergency contact name is required.');
  min('emergencyContactPhone', 10, 'Enter a valid emergency contact phone.');
  return e;
}

export default function Register() {
  const { status, register } = useAuth();
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    activeOrganizations()
      .then((list) => {
        setOrgs(list);
        if (list.length === 1) setForm((f) => ({ ...f, organizationId: list[0].id }));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (status === 'signedIn') return <Redirect href="/" />;

  const set = (key: keyof Form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const field = (key: keyof Form, label: string, props: Partial<ComponentProps<typeof TextField>> = {}) => (
    <TextField label={label} value={form[key]} onChangeText={set(key)} error={errors[key]} {...props} />
  );

  const submit = async () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setError('Please correct the highlighted fields.');
      return;
    }
    setBusy(true);
    setError(null);
    const t = (s: string) => s.trim();
    const input: RegisterInput = {
      organizationId: form.organizationId,
      email: t(form.email),
      password: form.password,
      firstName: t(form.firstName),
      ...(t(form.middleName) ? { middleName: t(form.middleName) } : {}),
      lastName: t(form.lastName),
      matricNumber: t(form.matricNumber),
      faculty: t(form.faculty),
      department: t(form.department),
      level: form.level,
      gender: form.gender as RegisterInput['gender'],
      dateOfBirth: t(form.dateOfBirth),
      phone: t(form.phone),
      emergencyContactName: t(form.emergencyContactName),
      emergencyContactPhone: t(form.emergencyContactPhone),
      ...(form.bloodGroup ? { bloodGroup: form.bloodGroup } : {}),
      ...(form.genotype ? { genotype: form.genotype } : {}),
      ...(t(form.allergies) ? { allergies: t(form.allergies) } : {}),
    };
    try {
      await register(input);
      // The entry gate shows the student's home (or a retry screen if the
      // new account's profile could not be loaded yet).
      router.replace('/');
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(fieldErrorMap(e.fieldErrors));
        setError(e.message);
      } else {
        setError('Registration failed.');
      }
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: 'Create student account', headerTintColor: colors.primary }} />
      <Screen>
        <ErrorBanner message={error} />

        <SectionTitle>Institution</SectionTitle>
        {orgs === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <ChoiceField
            label="Your institution"
            options={orgs.map((o) => o.name)}
            value={orgs.find((o) => o.id === form.organizationId)?.name ?? ''}
            onChange={(name) => set('organizationId')(orgs.find((o) => o.name === name)?.id ?? '')}
            error={errors.organizationId}
          />
        )}

        <SectionTitle>Account</SectionTitle>
        {field('email', 'Email', { autoCapitalize: 'none', keyboardType: 'email-address', autoCorrect: false })}
        {field('password', 'Password (at least 8 characters)', { secureTextEntry: true })}
        {field('confirm', 'Confirm password', { secureTextEntry: true })}

        <SectionTitle>Personal details</SectionTitle>
        {field('firstName', 'First name')}
        {field('middleName', 'Middle name (optional)')}
        {field('lastName', 'Last name')}
        <ChoiceField label="Gender" options={GENDERS} value={form.gender} onChange={set('gender')} error={errors.gender} />
        {field('dateOfBirth', 'Date of birth (YYYY-MM-DD)', { keyboardType: 'numbers-and-punctuation', placeholder: '2004-06-01' })}
        {field('phone', 'Phone number', { keyboardType: 'phone-pad' })}

        <SectionTitle>Studies</SectionTitle>
        {field('matricNumber', 'Matric number', { autoCapitalize: 'characters' })}
        {field('faculty', 'Faculty')}
        {field('department', 'Department')}
        <ChoiceField label="Level" options={LEVELS} value={form.level} onChange={set('level')} error={errors.level} />

        <SectionTitle>Emergency contact</SectionTitle>
        {field('emergencyContactName', 'Contact name')}
        {field('emergencyContactPhone', 'Contact phone', { keyboardType: 'phone-pad' })}

        <SectionTitle>Health (optional)</SectionTitle>
        <ChoiceField label="Blood group" options={BLOOD_GROUPS} value={form.bloodGroup} onChange={set('bloodGroup')} clearable />
        <ChoiceField label="Genotype" options={GENOTYPES} value={form.genotype} onChange={set('genotype')} clearable />
        {field('allergies', 'Allergies', { multiline: true })}

        <Button title="Create account" onPress={() => void submit()} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
