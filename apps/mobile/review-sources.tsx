import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WearableReviewInput, WearableSnapshot } from '@health-coach/health-core/wearable-review';
import { colors, fonts, typography } from './theme';
import { metricLabels } from './wearable-labels';

export function ReviewSources({
  coverage,
  snapshot
}: {
  coverage: WearableReviewInput['coverage'];
  snapshot: WearableSnapshot;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Text style={typography.meta}>
          Read {snapshot.syncedAt} · {snapshot.timeZone}
        </Text>
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
              {metricLabels[item.metric]}: {item.days}/21 days with records ·{' '}
              {item.comparable ? 'enough recorded days to compare' : 'not enough recorded days'}
              {' · '}
              {item.recentDays}/3 recent days · {item.baselineDays}/18 baseline days (7 needed)
              {item.originsChanged ? ' · contributing sources vary across days' : ''}
              {' · Sources: '}
              {item.origins.length ? item.origins.join(', ') : 'none available'}
            </Text>
          ))}
          <Text style={typography.meta}>
            Health Connect combines these totals using your app priorities to remove overlapping steps and sleep.
          </Text>
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
