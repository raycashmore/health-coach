import { StyleSheet, Text, View } from 'react-native';
import type { WearableEvidence } from '@health-coach/health-core/wearable-review';
import { formatChange, formatMetric } from './format';
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
        <Text style={styles.change}>{formatChange(item.id, item.baselineMean, item.recentMean)}</Text>
      </View>
      <View style={styles.bars} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={[styles.bar, styles.baselineBar, { width: `${(item.baselineMean / largest) * 100}%` }]} />
        <View style={[styles.bar, styles.recentBar, { width: `${(item.recentMean / largest) * 100}%` }]} />
      </View>
      <Text style={styles.values}>
        {formatMetric(item.id, item.baselineMean)} → {formatMetric(item.id, item.recentMean)} a day
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 6 },
  bars: { gap: 3 },
  baselineBar: { backgroundColor: colors.rule },
  change: { ...typography.change, flexShrink: 0, fontSize: 22, fontVariant: ['tabular-nums'], letterSpacing: -0.4 },
  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  recentBar: { backgroundColor: colors.accent },
  section: { gap: 20 },
  signal: { gap: 8 },
  signalHeading: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { height: 4, width: 10 },
  values: { ...typography.meta, fontVariant: ['tabular-nums'] }
});
