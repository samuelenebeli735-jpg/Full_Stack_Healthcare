/**
 * SHMS mobile design system: tokens (color, type, spacing, radius) and the
 * shared building blocks every screen uses. Screens should compose these
 * instead of styling text and boxes inline.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ tokens */

export const colors = {
  // Brand: a calm clinical blue with a teal accent.
  primary: '#0B5CAD',
  primaryDark: '#084A8C',
  primarySoft: '#E7F0FA',
  primaryText: '#FFFFFF',
  accent: '#0F8B8D',
  accentSoft: '#E3F4F4',

  text: '#14213D',
  textSecondary: '#4A5568',
  muted: '#64748B',
  border: '#DCE3EC',
  divider: '#EDF1F6',
  background: '#F3F6FA',
  card: '#FFFFFF',

  success: '#1E7B3A',
  successBg: '#E6F4EA',
  warning: '#9A5B00',
  warningBg: '#FFF4E0',
  danger: '#B42318',
  dangerBg: '#FDECEA',
  info: '#1D4ED8',
  infoBg: '#E8EFFE',
  neutral: '#475569',
  neutralBg: '#EEF2F6',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const type = StyleSheet.create({
  screenTitle: { fontSize: 26, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  screenSubtitle: { fontSize: 15, color: colors.muted, marginTop: 2 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  secondary: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  caption: { fontSize: 12, color: colors.muted },
  stat: { fontSize: 30, fontWeight: '800', color: colors.text },
});

const shadow: ViewStyle = Platform.select({
  android: { elevation: 1 },
  default: { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
}) as ViewStyle;

/** Shared bottom-tab look for the student and staff areas. */
export const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: '#8A97A8',
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
  tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.card },
};

/** Shared stack-header look for pushed screens. */
export const stackScreenOptions = {
  headerTintColor: colors.primary,
  headerStyle: { backgroundColor: colors.card },
  headerTitleStyle: { color: colors.text, fontWeight: '600' as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

/* ------------------------------------------------------------------ layout */

/** A screen with safe-area padding, optional scrolling and pull-to-refresh. */
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
          refreshControl={
            refresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} colors={[colors.primary]} tintColor={colors.primary} />
            ) : undefined
          }>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Screen heading with an optional subtitle. */
export function Title({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={type.screenTitle}>{children}</Text>
      {subtitle ? <Text style={type.screenSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={type.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

/* -------------------------------------------------------------------- text */

/** Secondary text (metadata, hints). */
export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.muted, style]}>{children}</Text>;
}

export function CardTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.cardTitle, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.body, style]}>{children}</Text>;
}

/** A label above a value; renders "—" (or `empty`) when the value is missing. */
export function InfoRow({ label, value, empty = '—' }: { label: string; value?: ReactNode; empty?: string }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.body, missing && { color: colors.muted }]}>{missing ? empty : value}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------- cards */

export function Card({ children, accent, style }: { children: ReactNode; accent?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null, style]}>{children}</View>;
}

/** A tappable card; shows a chevron unless `chevron={false}`. */
export function PressableCard({
  children,
  onPress,
  accent,
  chevron = true,
}: {
  children: ReactNode;
  onPress: () => void;
  accent?: string;
  chevron?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null,
        pressed && { backgroundColor: colors.divider },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>{children}</View>
        {chevron ? <Ionicons name="chevron-forward" size={18} color="#A0AEC0" style={{ marginLeft: space.sm }} /> : null}
      </View>
    </Pressable>
  );
}

/** A circular icon badge used at the start of cards and in empty states. */
export function IconCircle({ name, color = colors.primary, bg = colors.primarySoft, size = 40 }: { name: IconName; color?: string; bg?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

/** Day/month block for a clinic date 'YYYY-MM-DD' at the start of appointment cards. */
export function DateBlock({ date, tone = 'primary' }: { date: string; tone?: 'primary' | 'neutral' }) {
  const [, m, d] = date.split('-').map(Number);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const fg = tone === 'primary' ? colors.primary : colors.neutral;
  const bg = tone === 'primary' ? colors.primarySoft : colors.neutralBg;
  return (
    <View style={{ width: 52, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', paddingVertical: 6, marginRight: space.md }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: fg, letterSpacing: 0.6 }}>{months[m - 1]}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: fg, lineHeight: 26 }}>{d}</Text>
    </View>
  );
}

/** A number with a label, for dashboards. `highlight` makes it the dominant tile. */
export function StatCard({ label, value, icon, highlight = false }: { label: string; value: ReactNode; icon?: IconName; highlight?: boolean }) {
  return (
    <View style={[styles.card, { flex: 1 }, highlight && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.xs }}>
        {icon ? <Ionicons name={icon} size={16} color={highlight ? '#CFE0F5' : colors.muted} style={{ marginRight: 6 }} /> : null}
        <Text style={[type.caption, highlight && { color: '#CFE0F5' }]}>{label}</Text>
      </View>
      <Text style={[type.stat, highlight && { color: colors.primaryText }]}>{value}</Text>
    </View>
  );
}

/* ----------------------------------------------------------------- buttons */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'link';

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
  size = 'md',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  icon?: IconName;
  /** `sm` renders an inline, content-width button. */
  size?: 'md' | 'sm';
}) {
  const inactive = disabled || loading;
  const fg =
    variant === 'primary' || variant === 'danger' ? colors.primaryText : variant === 'link' ? colors.primary : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'link' && styles.buttonLink,
        pressed && !inactive && { opacity: 0.85 },
        inactive && { opacity: 0.5 },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.buttonText, size === 'sm' && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------- forms */

export function TextField({
  label,
  error,
  helper,
  required,
  ...props
}: TextInputProps & { label: string; error?: string; helper?: string; required?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={[type.label, { marginBottom: 6 }]}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor="#94A3B8"
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          props.editable === false && { backgroundColor: colors.divider, color: colors.textSecondary },
          props.style,
        ]}
      />
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} style={{ marginRight: 4 }} />
          <Text style={styles.fieldError}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={[type.caption, { marginTop: 6 }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

/** A selectable pill (dates, times, services, filters). */
export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        selected && { borderColor: colors.primary, backgroundColor: colors.primary },
        pressed && !selected && { backgroundColor: colors.divider },
        disabled && { opacity: 0.4 },
      ]}>
      <Text style={{ color: selected ? colors.primaryText : colors.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
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
  required,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  clearable?: boolean;
  required?: boolean;
}) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={[type.label, { marginBottom: 8 }]}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
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

/* --------------------------------------------------------- feedback states */

type Tone = 'info' | 'warning' | 'success' | 'danger';
const TONES: Record<Tone, { fg: string; bg: string; icon: IconName }> = {
  info: { fg: colors.info, bg: colors.infoBg, icon: 'information-circle' },
  warning: { fg: colors.warning, bg: colors.warningBg, icon: 'warning' },
  success: { fg: colors.success, bg: colors.successBg, icon: 'checkmark-circle' },
  danger: { fg: colors.danger, bg: colors.dangerBg, icon: 'alert-circle' },
};

/** A message box with an icon; `title` is shown in bold above the text. */
export function Banner({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg, borderLeftColor: t.fg }]}>
      <Ionicons name={t.icon} size={20} color={t.fg} style={{ marginRight: space.sm, marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={{ color: t.fg, fontWeight: '700', marginBottom: children ? 2 : 0 }}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={{ color: t.fg, lineHeight: 20 }}>{children}</Text> : children}
      </View>
    </View>
  );
}

/** The server's error message, as reported. */
export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <Banner tone="danger">{message}</Banner>;
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={[type.muted, { marginTop: space.md }]}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon = 'file-tray-outline',
  action,
}: {
  title: string;
  message?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <IconCircle name={icon} size={56} color={colors.muted} bg={colors.neutralBg} />
      <Text style={[type.cardTitle, { marginTop: space.md, textAlign: 'center' }]}>{title}</Text>
      {message ? <Text style={[type.muted, { textAlign: 'center', marginTop: space.xs }]}>{message}</Text> : null}
      {action ? <View style={{ marginTop: space.md, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ status */

const STATUS: Record<string, { label: string; fg: string; bg: string; icon: IconName }> = {
  scheduled: { label: 'Awaiting confirmation', fg: colors.warning, bg: colors.warningBg, icon: 'time-outline' },
  confirmed: { label: 'Confirmed', fg: colors.info, bg: colors.infoBg, icon: 'checkmark-circle-outline' },
  checked_in: { label: 'Checked in', fg: '#4338CA', bg: '#EEF0FF', icon: 'log-in-outline' },
  waiting: { label: 'Waiting', fg: '#4338CA', bg: '#EEF0FF', icon: 'hourglass-outline' },
  called: { label: 'Called', fg: '#B45309', bg: '#FEF3C7', icon: 'megaphone-outline' },
  in_progress: { label: 'In consultation', fg: colors.accent, bg: colors.accentSoft, icon: 'medkit-outline' },
  completed: { label: 'Completed', fg: colors.success, bg: colors.successBg, icon: 'checkmark-done-outline' },
  cancelled: { label: 'Cancelled', fg: colors.neutral, bg: colors.neutralBg, icon: 'close-circle-outline' },
  no_show: { label: 'Missed', fg: colors.danger, bg: colors.dangerBg, icon: 'alert-circle-outline' },
};

export function statusLabel(status: string): string {
  return STATUS[status]?.label || status;
}

/** Accent color for a status (card edges). */
export function statusColor(status: string): string {
  return STATUS[status]?.fg || colors.neutral;
}

/** Status pill with an icon and a text label (never color alone). */
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] || { label: status, fg: colors.neutral, bg: colors.neutralBg, icon: 'ellipse-outline' as IconName };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Ionicons name={s.icon} size={13} color={s.fg} style={{ marginRight: 4 }} />
      <Text style={{ color: s.fg, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
    </View>
  );
}

/** A small neutral pill, e.g. "Not available yet". */
export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | Tone }) {
  const t = tone === 'neutral' ? { fg: colors.neutral, bg: colors.neutralBg } : { fg: TONES[tone].fg, bg: TONES[tone].bg };
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

/** App mark used on the sign-in screens. */
export function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <View style={{ alignItems: 'center', marginTop: space.xxl, marginBottom: space.xl }}>
      <IconCircle name="medkit" size={64} color={colors.primaryText} bg={colors.primary} />
      <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary, marginTop: space.md, letterSpacing: 0.5 }}>SHMS</Text>
      <Text style={[type.muted, { textAlign: 'center' }]}>{subtitle}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.xl, paddingBottom: 48 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 50,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  buttonSm: { minHeight: 38, alignSelf: 'flex-start', paddingHorizontal: 14, marginRight: space.sm, borderRadius: radius.sm },
  buttonSecondary: { backgroundColor: colors.primarySoft },
  buttonDanger: { backgroundColor: colors.danger },
  buttonLink: { backgroundColor: 'transparent', minHeight: 40 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: 13 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  banner: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: space.md,
    marginBottom: space.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  empty: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});

