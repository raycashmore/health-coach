import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { rule, typography } from './theme';

export function SectionHeading({ accessory, title }: { accessory?: ReactNode; title: string }) {
  return (
    <View style={styles.heading}>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={typography.label}>
          {title}
        </Text>
        {accessory}
      </View>
      <View style={rule.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 16 },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }
});
