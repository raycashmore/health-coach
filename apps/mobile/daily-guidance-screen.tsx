import { useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { buildWearableReview, validateWearableExplanation } from '@health-coach/health-core/wearable-review';
import type {
  WearableExplanation,
  WearableReviewInput,
  WearableSnapshot
} from '@health-coach/health-core/wearable-review';
import { readWearableSnapshot } from './read-wearable-snapshot';
import { supabase } from './supabase-client';

type Review = { snapshot: WearableSnapshot; analysis: WearableReviewInput };
type Explanation = { reviewId: string; content: WearableExplanation; question: string };

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
      {error ? <Text role="alert">{error}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
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

  async function rate(judgement: 'useful' | 'not-useful' | 'concerning') {
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
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontSize: 28 }}>
        Your recent patterns
      </Text>
      <Text>
        Compare the last 3 completed days with your preceding record. Read steps and sleep shared with Health Connect by
        your existing wearable apps.
      </Text>
      <Text>
        Read-only access. No background monitoring. The local comparison stays on your phone until you request an
        explanation.
      </Text>
      <Button
        title={busy === 'reading' ? 'Reading completed days…' : 'Read wearable data'}
        disabled={busy !== null}
        onPress={() => void read()}
      />
      {feedbackLocation === 'read' ? feedback : null}
      {review ? (
        <>
          <Text>
            Read {review.snapshot.syncedAt} · {review.snapshot.timeZone}
          </Text>
          <Text>
            {review.snapshot.days[0]?.date} to {review.snapshot.days.at(-1)?.date}
          </Text>
          <Text>
            {review.analysis.status === 'insufficient-data'
              ? 'Not enough recorded days for a comparison yet.'
              : review.analysis.status === 'change'
                ? 'A recorded difference is available to explore.'
                : 'No display threshold crossed in the comparable signals.'}
          </Text>
          {review.analysis.coverage.map((item) => (
            <Text key={item.metric}>
              {item.metric === 'steps' ? 'Steps' : 'Recorded sleep'}: {item.days}/21 days with records ·{' '}
              {item.comparable ? 'enough recorded days to compare' : 'not enough recorded days'}
              {' · '}
              {item.recentDays}/3 recent days · {item.baselineDays}/18 baseline days (7 needed)
              {item.originsChanged ? ' · contributing sources vary across days' : ''}
              {' · Sources: '}
              {item.origins.length ? item.origins.join(', ') : 'none available'}
            </Text>
          ))}
          <Text>
            Health Connect combines these totals using your app priorities to remove overlapping steps and sleep.
            Changes in contributing apps can affect the totals; a recorded difference does not prove a change in your
            activity or sleep.
          </Text>
          {review.analysis.evidence.map((item) => (
            <View key={item.id} style={{ padding: 16, backgroundColor: '#eeeeea', gap: 8 }}>
              <Text accessibilityRole="header">{item.id === 'steps' ? 'Steps' : 'Recorded sleep'}</Text>
              <Text>
                Recent: {item.recentMean} {item.unit} over {item.recentDays} days ({item.recentStart}–{item.endDate})
              </Text>
              <Text>
                Baseline: {item.baselineMean} {item.unit} over {item.baselineDays} days, starting {item.baselineStart}
              </Text>
              <Text>
                Difference: {item.difference > 0 ? '+' : ''}
                {item.difference} {item.unit}
              </Text>
              <Text>Sources: {item.origins.join(', ')}</Text>
            </View>
          ))}
          {review.analysis.limitations.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
          {review.analysis.evidence.length ? (
            <>
              <Text>
                Requesting an explanation sends these 21 days of derived totals to your private server. The configured
                model receives the calculated comparisons and coverage. A private snapshot is retained for evaluation.
              </Text>
              <TextInput
                accessibilityLabel="Question about these wearable patterns"
                placeholder="Ask about this comparison (optional)"
                multiline
                maxLength={500}
                value={question}
                onChangeText={setQuestion}
                editable={busy === null}
                style={{ borderWidth: 1, borderColor: '#888888', padding: 12 }}
              />
              <Text>Questions use only the comparisons shown here; other health records are not retrieved.</Text>
              <Button
                title={busy === 'explaining' ? 'Working…' : 'Explain these changes with AI'}
                disabled={busy !== null}
                onPress={() => void explain()}
              />
              {feedbackLocation === 'explain' ? feedback : null}
            </>
          ) : null}
        </>
      ) : null}
      {explanation ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header">AI interpretation · check against the evidence above</Text>
          {explanation.question ? <Text>Your question: {explanation.question}</Text> : null}
          <Text>{explanation.content.observation}</Text>
          <Text>Evidence: {explanation.content.evidenceIds.join(', ')}</Text>
          <Text>{explanation.content.uncertainty}</Text>
          <Text>{explanation.content.contextQuestion}</Text>
          <Text>
            Add context using the question field above. It stays with this private review and does not change your
            health record.
          </Text>
          {(['useful', 'not-useful', 'concerning'] as const).map((option) => (
            <Button
              key={option}
              title={option.replace('-', ' ')}
              disabled={busy !== null}
              onPress={() => void rate(option)}
            />
          ))}
          {feedbackLocation === 'rating' ? feedback : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
