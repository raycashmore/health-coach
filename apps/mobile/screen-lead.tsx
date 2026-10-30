import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { typography } from './theme';

export function ScreenLead({
  children,
  context,
  headline
}: {
  children?: ReactNode;
  context: string;
  headline: string;
}) {
  return (
    <View style={styles.lead}>
      <Text style={typography.context}>{context}</Text>
      <Text accessibilityRole="header" style={typography.headline}>
        {headline}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { gap: 12 }
});
