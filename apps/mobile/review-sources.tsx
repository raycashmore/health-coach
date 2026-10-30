import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WearableReviewInput } from '@health-coach/health-core/wearable-review';
import { colors, fonts, typography } from './theme';
import { metricLabels, sourceName } from './wearable-labels';

export function ReviewSources({ coverage, status }: { coverage: WearableReviewInput['coverage']; status: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Text style={typography.meta}>{status}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={12}
          onPress={() => setOpen((current) => !current)}
        >
          <Text style={styles.link}>{open ? 'Hide sources' : 'Sources →'}</Text>
        </Pressable>
      </View>
      {open ? (
        <View style={styles.details}>
          {coverage.map((item) => (
            <Text key={item.metric} style={typography.meta}>
              {metricLabels[item.metric]} · {item.days} of 21 days
              {item.origins.length ? ` · ${[...new Set(item.origins.map(sourceName))].join(', ')}` : ''}
              {item.originsChanged ? ' · Sources changed' : ''}
            </Text>
          ))}
          <Text style={typography.meta}>Sleep is counted midnight to midnight.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  details: { gap: 8 },
  link: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 12 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  section: { gap: 12 }
});
