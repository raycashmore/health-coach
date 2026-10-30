import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { buildWearableReview, validateWearableExplanation } from '@health-coach/health-core/wearable-review';
import type {
  WearableExplanation,
  WearableReviewInput,
  WearableSnapshot
} from '@health-coach/health-core/wearable-review';
import { ActionButton } from './action-button';
import { BaselineComparison } from './baseline-comparison';
import { readWearableSnapshot } from './read-wearable-snapshot';
import { ReviewSources } from './review-sources';
import { supabase } from './supabase-client';
import { RatingButtons } from './rating-buttons';
import type { RatingJudgement } from './rating-buttons';
import { ScreenLead } from './screen-lead';
import { SectionHeading } from './section-heading';
import { colors, field, layout, rule, typography } from './theme';

type Review = { snapshot: WearableSnapshot; analysis: WearableReviewInput };
type Explanation = { reviewId: string; content: WearableExplanation; question: string };

const headlines = {
  'insufficient-data': 'Not enough recorded days for a comparison yet.',
  change: 'A recorded difference is available to explore.',
  'no-change': 'No display threshold crossed in the comparable signals.'
} satisfies Record<WearableReviewInput['status'], string>;

export function DailyGuidanceScreen() {
  const [review, setReview] = useState<Review | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState<'reading' | 'explaining' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [feedbackLocation, setFeedbackLocation] = useState<'read' | 'explain' | 'rating'>('read');
  const [question, setQuestion] = useState('');
  const feedback = (
    <>
      {error ? (
        <Text role="alert" style={typography.alert}>
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={typography.note}>
          {message}
        </Text>
      ) : null}
    </>
  );

  async function read() {
    setFeedbackLocation('read');
    setBusy('reading');
    setError(null);
    setMessage(null);
    setReview(null);
    setExplanation(null);
    try {
      const snapshot = await readWearableSnapshot();
      setReview({ snapshot, analysis: buildWearableReview(snapshot) });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The wearable read failed. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function explain() {
    if (!review || !supabase) return;
    setFeedbackLocation('explain');
    setError(null);
    setMessage(null);
    const serverUrl = process.env.EXPO_PUBLIC_HEALTH_COACH_API_URL;
    if (!serverUrl || !/^https?:\/\//.test(serverUrl)) {
      setError('Configure the private Health Coach server URL to request an AI explanation.');
      return;
    }
    if (!__DEV__ && !serverUrl.startsWith('https://')) {
      setError('The private review server must use HTTPS outside development.');
      return;
    }
    setBusy('explaining');
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) throw new Error('Sign in again before requesting an explanation.');
      const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/wearable-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.session.access_token}` },
        body: JSON.stringify({ snapshot: review.snapshot, question }),
        signal: AbortSignal.timeout(55_000)
      });
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null)
        throw new Error('The review service returned an invalid response.');
      if (!response.ok)
        throw new Error('error' in body && typeof body.error === 'string' ? body.error : 'The review failed.');
      if (
        'kind' in body &&
        body.kind === 'ai' &&
        'explanation' in body &&
        'reviewId' in body &&
        typeof body.reviewId === 'string'
      ) {
        setExplanation({
          reviewId: body.reviewId,
          question,
          content: validateWearableExplanation(body.explanation, review.analysis)
        });
      } else {
        setMessage(
          'AI explanations are not enabled, or coverage is insufficient. Your calculated comparison is available below.'
        );
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The explanation failed. Your calculated comparison is still available.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function rate(judgement: RatingJudgement) {
    if (!supabase || !explanation) return;
    setFeedbackLocation('rating');
    setError(null);
    setMessage(null);
    setBusy('explaining');
    try {
      const result = await supabase
        .from('wearable_reviews')
        .update({ feedback: judgement })
        .eq('id', explanation.reviewId);
      setMessage(result.error ? 'Your rating could not be saved.' : 'Your private rating was saved.');
    } catch {
      setError('Your rating could not be saved.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={layout.screen} keyboardShouldPersistTaps="handled">
      <ScreenLead
        context={
          review
            ? `Your recent patterns · ${review.snapshot.days[0]?.date} to ${review.snapshot.days.at(-1)?.date}`
            : 'Your recent patterns'
        }
        headline={review ? headlines[review.analysis.status] : 'How have your last few days compared?'}
      >
        <Text style={typography.body}>
          Compare the last 3 completed days with your preceding record. Read steps and sleep shared with Health Connect
          by your existing wearable apps.
        </Text>
        <Text style={typography.note}>
          Read-only access. No background monitoring. The local comparison stays on your phone until you request an
          explanation.
        </Text>
      </ScreenLead>
      <View style={styles.group}>
        <ActionButton
          label={busy === 'reading' ? 'Reading completed days…' : 'Read wearable data'}
          disabled={busy !== null}
          onPress={() => void read()}
          variant={review ? 'secondary' : 'primary'}
        />
        {feedbackLocation === 'read' ? feedback : null}
      </View>
      {review ? (
        <View style={styles.group}>
          {review.analysis.evidence.length ? <BaselineComparison evidence={review.analysis.evidence} /> : null}
          {review.analysis.limitations.map((item) => (
            <Text key={item} style={typography.note}>
              {item}
            </Text>
          ))}
          <Text style={typography.note}>
            Changes in contributing apps can affect the totals; a recorded difference does not prove a change in your
            activity or sleep.
          </Text>
          <ReviewSources coverage={review.analysis.coverage} snapshot={review.snapshot} />
        </View>
      ) : null}
      {review?.analysis.evidence.length ? (
        <View style={styles.group}>
          <View style={rule.light} />
          <Text style={typography.meta}>
            Requesting an explanation sends these 21 days of derived totals to your private server. The configured model
            receives the calculated comparisons and coverage. A private snapshot is retained for evaluation.
          </Text>
          <TextInput
            accessibilityLabel="Question about these wearable patterns"
            placeholder="Ask about this comparison (optional)"
            placeholderTextColor={colors.secondary}
            multiline
            maxLength={500}
            value={question}
            onChangeText={setQuestion}
            editable={busy === null}
            style={field.input}
          />
          <Text style={typography.meta}>
            Questions use only the comparisons shown here; other health records are not retrieved.
          </Text>
          <ActionButton
            label={busy === 'explaining' ? 'Working…' : 'Explain these changes with AI'}
            disabled={busy !== null}
            onPress={() => void explain()}
          />
          {feedbackLocation === 'explain' ? feedback : null}
        </View>
      ) : null}
      {explanation ? (
        <View style={styles.group}>
          <SectionHeading title="AI interpretation · check against the evidence above" />
          {explanation.question ? <Text style={typography.context}>Your question: {explanation.question}</Text> : null}
          <Text style={typography.body}>{explanation.content.observation}</Text>
          <Text style={typography.meta}>Evidence: {explanation.content.evidenceIds.join(', ')}</Text>
          <Text style={typography.note}>{explanation.content.uncertainty}</Text>
          <View style={styles.prompt}>
            <Text style={typography.prompt}>{explanation.content.contextQuestion}</Text>
            <Text style={typography.meta}>
              Add context using the question field above. It stays with this private review and does not change your
              health record.
            </Text>
          </View>
          <RatingButtons disabled={busy !== null} onRate={(judgement) => void rate(judgement)} />
          {feedbackLocation === 'rating' ? feedback : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { gap: 16 },
  prompt: { borderTopColor: colors.rule, borderTopWidth: 1, gap: 8, paddingTop: 16 }
});
