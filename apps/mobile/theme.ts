import { StyleSheet } from 'react-native';

export const colors = {
  accent: '#E84512',
  background: '#FFFFFF',
  body: '#2B2B2B',
  context: '#6B6B6B',
  ink: '#111111',
  rule: '#DADADA',
  secondary: '#565656',
  surface: '#F6F6F6'
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold'
} as const;

export const spacing = { margin: 24, section: 28 } as const;

export const layout = StyleSheet.create({
  screen: { gap: spacing.section, padding: spacing.margin, paddingTop: spacing.section }
});

export const typography = StyleSheet.create({
  context: { color: colors.context, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.2 },
  headline: { color: colors.ink, fontFamily: fonts.bold, fontSize: 30, letterSpacing: -0.9, lineHeight: 32 },
  title: { color: colors.ink, fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.5, lineHeight: 26 },
  body: { color: colors.body, fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  signal: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  change: { color: colors.accent, fontFamily: fonts.bold, fontSize: 14 },
  note: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  label: { color: colors.ink, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase' },
  prompt: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  alert: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 }
});

export const rule = StyleSheet.create({
  ink: { backgroundColor: colors.ink, height: 1 },
  light: { backgroundColor: colors.rule, height: 1 }
});

export const field = StyleSheet.create({
  input: {
    borderBottomColor: colors.ink,
    borderBottomWidth: 1,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 15,
    paddingVertical: 14
  }
});
