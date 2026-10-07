import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  primary: '#1565C0',
  primaryText: '#FFFFFF',
  text: '#1A1F2B',
  muted: '#5F6B7A',
  border: '#D5DCE4',
  background: '#F4F6F9',
  card: '#FFFFFF',
  danger: '#C62828',
  dangerBg: '#FDECEA',
  success: '#2E7D32',
};

/** A screen with safe-area padding and optional scrolling. */
export function Screen({
  children,
  scroll = true,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Enables pull-to-refresh. */
  onRefresh?: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} /> : undefined}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (pressed || inactive) && { opacity: 0.6 },
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.primaryText} />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' && { color: colors.primary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function TextField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, error ? { borderColor: colors.danger } : null, props.style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={{ color: colors.danger }}>{message}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={[styles.muted, { marginTop: 12 }]}>{label}</Text> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8 },
  muted: { fontSize: 14, color: colors.muted },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  fieldError: { color: colors.danger, fontSize: 13, marginTop: 4 },
  errorBanner: {
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  scheduled: { bg: '#FFF4E5', fg: '#9A5B00' },
  confirmed: { bg: '#E3F2FD', fg: '#0D47A1' },
  checked_in: { bg: '#E8EAF6', fg: '#283593' },
  waiting: { bg: '#E8EAF6', fg: '#283593' },
  called: { bg: '#FFF8E1', fg: '#8D6E00' },
  in_progress: { bg: '#E0F2F1', fg: '#00695C' },
  completed: { bg: '#E8F5E9', fg: '#1B5E20' },
  cancelled: { bg: '#ECEFF1', fg: '#455A64' },
  no_show: { bg: '#FDECEA', fg: '#B71C1C' },
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  waiting: 'Waiting',
  called: 'Called',
  in_progress: 'In consultation',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'Missed',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || { bg: '#ECEFF1', fg: '#455A64' };
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '700' }}>{statusLabel(status)}</Text>
    </View>
  );
}

/** A selectable pill (dates, times, services). */
export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primary : colors.card,
          marginRight: 8,
          marginBottom: 8,
        },
        disabled && { opacity: 0.4 },
      ]}>
      <Text style={{ color: selected ? colors.primaryText : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 10, marginBottom: 8 }}>{children}</Text>;
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{title}</Text>
      {message ? <Text style={[styles.muted, { textAlign: 'center', marginTop: 6 }]}>{message}</Text> : null}
    </View>
  );
}

/** A tappable card row. */
export function PressableCard({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

/** A labelled single-choice row of chips (tap the selected chip again to clear when `clearable`). */
export function ChoiceField({
  label,
  options,
  value,
  onChange,
  error,
  clearable = false,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  clearable?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Chip key={o} label={o} selected={o === value} onPress={() => onChange(clearable && o === value ? '' : o)} />
        ))}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/** Server field errors keyed by field name (from ApiError.fieldErrors). */
export function fieldErrorMap(errors: { field: string; message: string }[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of errors ?? []) if (!map[e.field]) map[e.field] = e.message;
  return map;
}
