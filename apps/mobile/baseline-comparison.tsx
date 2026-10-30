import { StyleSheet, Text, View } from 'react-native';
import type { WearableEvidence } from '@health-coach/health-core/wearable-review';
import { SectionHeading } from './section-heading';
import { colors, typography } from './theme';
import { metricLabels } from './wearable-labels';

export function BaselineComparison({ evidence }: { evidence: WearableEvidence[] }) {
  return (
    <View style={styles.section}>
      <SectionHeading
        accessory={
          <View style={styles.legend}>
            <LegendItem color={colors.rule} label="Previous 18 days" />
            <LegendItem color={colors.accent} label="Last 3 days" />
          </View>
        }
        title="Vs. your baseline"
      />
      {evidence.map((item) => (
        <Signal key={item.id} item={item} />
      ))}
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={typography.meta}>{label}</Text>
    </View>
  );
}

function Signal({ item }: { item: WearableEvidence }) {
  const largest = Math.max(item.baselineMean, item.recentMean, 1);
  return (
    <View style={styles.signal}>
      <View style={styles.signalHeading}>
        <Text accessibilityRole="header" style={typography.signal}>
          {metricLabels[item.id]}
        </Text>
        <Text style={typography.change}>
          {item.difference > 0 ? '+' : item.difference < 0 ? '−' : ''}
          {Math.abs(item.difference)} {item.unit}
        </Text>
      </View>
      <View style={styles.bars} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={[styles.bar, styles.baselineBar, { width: `${(item.baselineMean / largest) * 100}%` }]} />
        <View style={[styles.bar, styles.recentBar, { width: `${(item.recentMean / largest) * 100}%` }]} />
      </View>
      <Text style={typography.meta}>
        {item.baselineMean} → {item.recentMean} {item.unit} average · baseline {item.baselineDays} days from{' '}
        {item.baselineStart} · recent {item.recentDays} days {item.recentStart} to {item.endDate}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 6 },
  bars: { gap: 3 },
  baselineBar: { backgroundColor: colors.rule },
  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  recentBar: { backgroundColor: colors.accent },
  section: { gap: 16 },
  signal: { gap: 8 },
  signalHeading: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { height: 4, width: 10 }
});
