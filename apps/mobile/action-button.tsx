import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts } from './theme';

export function ActionButton({
  disabled = false,
  label,
  onPress,
  selected,
  variant = 'primary'
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  selected?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const filled = variant === 'primary' || selected === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, filled ? styles.filled : null, disabled ? styles.disabled : null]}
    >
      <Text style={[styles.label, filled ? styles.filledLabel : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.ink,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16
  },
  disabled: { opacity: 0.4 },
  filled: { backgroundColor: colors.ink },
  filledLabel: { color: colors.background },
  label: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, textAlign: 'center' }
});
