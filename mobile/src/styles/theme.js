import { StyleSheet, Platform } from 'react-native';

export const colors = {
  primary:      '#0891B2',
  primaryDark:  '#0E7490',
  primaryTint:  '#ECFEFF',
  primaryLight: '#CFFAFE',
  accent:       '#059669',
  accentTint:   '#ECFDF5',
  danger:       '#DC2626',
  dangerTint:   '#FEF2F2',
  warning:      '#D97706',
  warningTint:  '#FFFBEB',
  indigo:       '#4F46E5',
  indigoTint:   '#EEF2FF',
  bg:           '#F8FAFC',
  surface:      '#FFFFFF',
  border:       '#E2E8F0',
  text:         '#1E293B',
  textMuted:    '#64748B',
};

export const radius = { sm: 8, md: 12, lg: 16, full: 100 };

export const shadow = {
  sm: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  md: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10, shadowRadius: 12, elevation: 4,
  },
  lg: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14, shadowRadius: 24, elevation: 8,
  },
};

export const AVATAR_GRADIENTS = [
  ['#0891B2','#0E7490'],
  ['#7C3AED','#5B21B6'],
  ['#059669','#047857'],
  ['#DC2626','#B91C1C'],
  ['#D97706','#B45309'],
  ['#2563EB','#1D4ED8'],
];

export function avatarColors(name) {
  return AVATAR_GRADIENTS[(name?.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length];
}

export function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export const typography = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700', color: colors.text },
  h4: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 14, fontWeight: '400', color: colors.text },
  small: { fontSize: 12, fontWeight: '400', color: colors.textMuted },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11, color: colors.textMuted },
});

export const base = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  spaceBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ghostBtn: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
