import { StyleSheet, Text, View } from 'react-native';
import type { ContextPacket } from '@health-coach/health-core/lab-context';
import { SectionHeading } from './section-heading';
import { formatMetric } from './format';
import { rule, typography } from './theme';

export function ContextPacketEvidence({ packet }: { packet: ContextPacket }) {
  return (
    <View style={styles.sections}>
      <Text style={typography.body}>{packet.question}</Text>
      <Text style={typography.meta}>
        Prepared as of {packet.asOf} · Local request date {packet.requestDate}
      </Text>
      <View style={rule.light} />
      <View style={styles.group}>
        <SectionHeading title="Laboratory panel" />
        {packet.panel ? (
          <>
            <Text style={typography.body}>Collected {packet.panel.collectionDate}</Text>
            <Text style={typography.meta}>
              Source: {packet.panel.sourceId} · Panel: {packet.panel.id}
            </Text>
            {packet.panel.results.map((result) => (
              <View key={result.evidenceId} style={styles.row}>
                <Text style={typography.body}>
                  {result.name}: {result.value} {result.unit}
                </Text>
                <Text style={typography.meta}>
                  Source range: {result.referenceRange ?? 'not supplied'} · {result.evidenceId} · {result.id}
                </Text>
              </View>
            ))}
            <Text style={typography.note}>
              {packet.panel.omittedResults} laboratory results omitted from this bounded packet.
            </Text>
          </>
        ) : (
          <>
            <Text role="alert" style={typography.alert}>
              {packet.laboratoryStatus === 'ambiguous'
                ? 'Collection dates are ambiguous. No latest panel was selected.'
                : 'Laboratory source unavailable.'}
            </Text>
            {packet.panelCandidates.map((panel) => (
              <Text key={panel.id} style={typography.meta}>
                {panel.id} · {panel.sourceId} · Collection date: {panel.collectionDate ?? 'unknown'}
              </Text>
            ))}
          </>
        )}
      </View>
      <View style={rule.light} />
      <View style={styles.group}>
        <SectionHeading title="Activity windows" />
        <Text style={typography.meta}>Snapshot: {packet.activitySnapshotId}</Text>
        {packet.activityStatus === 'unavailable' ? (
          <Text role="alert" style={typography.alert}>
            Activity source unavailable. No values or coverage were used.
          </Text>
        ) : null}
        {packet.windows.map((window) => (
          <View key={window.id} style={styles.group}>
            <Text style={typography.signal}>
              {window.id === 'activity-collection' ? 'Before collection' : 'Before this request'}: {window.start} –{' '}
              {window.end}
            </Text>
            <Text style={typography.meta}>
              {window.timeZone} · Steps {window.coveredStepsDays}/{window.expectedDays} days · Sleep{' '}
              {window.coveredSleepDays}/{window.expectedDays} days
            </Text>
            {window.days.map((day) => (
              <Text key={day.date} style={typography.note}>
                {day.date} · Steps: {day.steps === null ? 'unknown' : formatMetric('steps', day.steps)} · Sleep:{' '}
                {day.sleepMinutes === null ? 'unknown' : formatMetric('sleepMinutes', day.sleepMinutes)}
              </Text>
            ))}
          </View>
        ))}
      </View>
      <View style={rule.light} />
      <View style={styles.group}>
        <SectionHeading title="Notes" />
        <Text style={typography.note}>
          {packet.notes.status === 'current'
            ? packet.kind === 'private-context'
              ? 'Prepared source revision checked unchanged when loaded. This does not establish when the notes were authored.'
              : 'Revision checked current when this packet was loaded.'
            : packet.notes.status === 'stale'
              ? 'Notes changed or were deleted. Previous passages withheld.'
              : 'Notes unavailable. No passages were used.'}
        </Text>
        <Text style={typography.meta}>Checked: {packet.notes.checkedAt}</Text>
        {packet.notes.revision ? (
          <Text style={typography.meta}>
            Revision: {packet.notes.revision} · Published: {packet.notes.publishedAt}
          </Text>
        ) : null}
        {packet.notes.status === 'current' ? (
          <>
            {packet.notes.sections.length === 0 ? (
              <Text style={typography.body}>No matching passages in this revision.</Text>
            ) : null}
            {packet.notes.sections.map((section) => (
              <View key={section.evidenceId} style={styles.group}>
                <Text style={typography.signal}>{section.headingPath.join(' / ') || 'Untitled section'}</Text>
                <Text style={typography.body}>{section.text}</Text>
                <Text style={typography.meta}>
                  {section.documentId} · {section.id} · Lines {section.startLine}–{section.endLine} ·{' '}
                  {section.evidenceId}
                </Text>
                <Text style={typography.meta}>
                  Authored: {section.authoredDate ?? 'unknown; chronology unverified'}
                </Text>
              </View>
            ))}
            <Text style={typography.note}>
              {packet.notes.omittedSections} matching note passages omitted. {packet.notes.datedCount} dated,{' '}
              {packet.notes.undatedCount} undated passages included.
            </Text>
          </>
        ) : null}
      </View>
      <View style={rule.light} />
      <View style={styles.group}>
        <SectionHeading
          title={packet.kind === 'private-context' ? 'Limits of this packet' : 'Limits of this example'}
        />
        {packet.limitations.map((limitation) => (
          <Text key={limitation} style={typography.note}>
            {limitation}
          </Text>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({ sections: { gap: 28 }, group: { gap: 12 }, row: { gap: 4 } });
