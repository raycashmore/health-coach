import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from './theme';

export function TopBar({ onSignOut }: { onSignOut?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={styles.name}>
          Health Coach
        </Text>
        {onSignOut ? (
          <Pressable
            accessibilityLabel="Account menu"
            accessibilityRole="button"
            accessibilityState={{ expanded: menuOpen }}
            hitSlop={12}
            onPress={() => setMenuOpen((open) => !open)}
          >
            <Text style={styles.menu}>•••</Text>
          </Pressable>
        ) : null}
      </View>
      {menuOpen && onSignOut ? (
        <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.menuItem}>
          <Text style={typography.signal}>Sign out</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: spacing.margin, paddingTop: 16 },
  menu: { color: colors.ink, fontFamily: fonts.regular, fontSize: 18 },
  menuItem: { alignItems: 'flex-end', paddingVertical: 12 },
  name: { ...typography.label, letterSpacing: 1 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }
});
