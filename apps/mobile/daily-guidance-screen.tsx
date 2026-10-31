import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { validateWearableExplanation } from '@health-coach/health-core/wearable-review';
import type { WearableExplanation, WearableReviewInput } from '@health-coach/health-core/wearable-review';
import { ActionButton } from './action-button';
import { BaselineComparison } from './baseline-comparison';
import { formatDate, formatTime } from './format';
import { openHealthConnectSettings } from './read-wearable-snapshot';
import { ReviewSources } from './review-sources';
import { supabase } from './supabase-client';
import { RatingButtons } from './rating-buttons';
import type { RatingJudgement } from './rating-buttons';
import { ScreenLead } from './screen-lead';
import { SectionHeading } from './section-heading';
import { colors, field, fonts, layout, rule, spacing, typography } from './theme';
import { useWearableReview } from './use-wearable-review';
import { metricLabels } from './wearable-labels';

type Explanation = { completedBefore: string; reviewId: string; content: WearableExplanation; question: string };

const headlines = {
  'insufficient-data': 'Not enough data yet.',
  change: 'Your last 3 days differ from your baseline.',
  'no-change': 'No large change from your baseline.'
} satisfies Record<WearableReviewInput['status'], string>;

function coverageGap(item: WearableReviewInput['coverage'][number]): string {
  return item.recentDays < 3
    ? `${metricLabels[item.metric]}: ${item.recentDays} of the last 3 days recorded.`
    : `${metricLabels[item.metric]}: ${item.baselineDays} of the previous 18 days recorded; 7 needed.`;
}

export function DailyGuidanceScreen() {
  const { failure, reading, refresh, review } = useWearableReview();
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [feedbackLocation, setFeedbackLocation] = useState<'explain' | 'rating'>('explain');
  const [question, setQuestion] = useState('');
  const scrollView = useRef<ScrollView>(null);
  const questionTop = useRef(0);
  const pendingReveal = useRef<{ remove: () => void } | null>(null);

  function cancelReveal() {
    pendingReveal.current?.remove();
    pendingReveal.current = null;
  }

  useEffect(() => cancelReveal, []);

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
  function scrollToQuestion() {
    scrollView.current?.scrollTo({ y: Math.max(0, questionTop.current - spacing.margin) });
  }

  function revealQuestion() {
    if (Keyboard.isVisible()) {
      scrollToQuestion();
      return;
    }
    // Scroll after the keyboard has resized the view; earlier offsets are clamped to the old height.
    cancelReveal();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      subscription.remove();
      timer = setTimeout(scrollToQuestion, 150);
    });
    pendingReveal.current = {
      remove: () => {
        subscription.remove();
        clearTimeout(timer);
      }
    };
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
    setBusy(true);
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
          completedBefore: review.snapshot.completedBefore,
          reviewId: body.reviewId,
          question,
          content: validateWearableExplanation(body.explanation, review.analysis)
        });
      } else {
        setMessage('AI explanations aren’t available for this comparison.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The explanation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function rate(judgement: RatingJudgement) {
    if (!supabase || !explanation) return;
    setFeedbackLocation('rating');
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const result = await supabase
        .from('wearable_reviews')
        .update({ feedback: judgement })
        .eq('id', explanation.reviewId);
      setMessage(result.error ? 'Your rating could not be saved.' : 'Your private rating was saved.');
    } catch {
      setError('Your rating could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const evidence = review?.analysis.evidence ?? [];
  const recent = evidence[0];
  const shownExplanation = explanation?.completedBefore === review?.snapshot.completedBefore ? explanation : null;
  const headline = review
    ? headlines[review.analysis.status]
    : failure
      ? failure.needsPermission
        ? failure.message
        : 'Couldn’t read your data.'
      : 'Reading your last few days…';

  return (
    <ScrollView
      ref={scrollView}
      contentContainerStyle={layout.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          colors={[colors.ink]}
          onRefresh={() => void refresh()}
          refreshing={reading && review !== null}
        />
      }
    >
      <ScreenLead
        context={recent ? `Last 3 days · ${formatDate(recent.endDate)}` : 'Last 3 days'}
        headline={headline}
      />
      {failure && !review ? (
        <View style={styles.group}>
          {failure.needsPermission ? null : <Text style={typography.note}>{failure.message}</Text>}
          {failure.needsPermission ? (
            <ActionButton label="Open Health Connect" onPress={() => void openHealthConnectSettings()} />
          ) : null}
          <ActionButton label="Try again" onPress={() => void refresh()} variant="secondary" />
        </View>
      ) : null}
      {review ? (
        <View style={styles.group}>
          {evidence.length ? <BaselineComparison evidence={evidence} /> : null}
          {review.analysis.coverage
            .filter((item) => !item.comparable && !review.blocked.includes(item.metric))
            .map((item) => (
              <Text key={item.metric} style={typography.note}>
                {coverageGap(item)}
              </Text>
            ))}
          {review.blocked.length ? (
            <View style={styles.inline}>
              <Text style={typography.note}>
                {review.blocked.map((metric) => metricLabels[metric]).join(' and ')} access is off.
              </Text>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={() => void openHealthConnectSettings()}>
                <Text style={styles.link}>Open Health Connect</Text>
              </Pressable>
            </View>
          ) : null}
          {failure ? (
            <View style={styles.inline}>
              <Text role="alert" style={typography.alert}>
                Couldn’t update.
              </Text>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={() => void refresh()}>
                <Text style={styles.link}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
          <ReviewSources
            coverage={review.analysis.coverage.filter((item) => !review.blocked.includes(item.metric))}
            status={reading ? 'Updating…' : `Updated ${formatTime(new Date(review.snapshot.syncedAt))}`}
          />
        </View>
      ) : null}
      {evidence.length ? (
        <View onLayout={(event) => (questionTop.current = event.nativeEvent.layout.y)} style={styles.group}>
          <View style={rule.light} />
          <TextInput
            accessibilityLabel="Question about these wearable patterns"
            placeholder="Ask a question (optional)"
            placeholderTextColor={colors.secondary}
            multiline
            maxLength={500}
            value={question}
            onChangeText={setQuestion}
            onFocus={revealQuestion}
            onBlur={cancelReveal}
            editable={!busy}
            style={field.input}
          />
          <Text style={typography.meta}>Sends 21 days of step and sleep totals to your server. A copy is kept.</Text>
          <ActionButton
            label={busy ? 'Working…' : 'Explain with AI'}
            disabled={busy || reading}
            onPress={() => void explain()}
          />
          {feedbackLocation === 'explain' ? feedback : null}
        </View>
      ) : null}
      {shownExplanation ? (
        <View style={styles.group}>
          <SectionHeading title="AI interpretation" />
          {shownExplanation.question ? (
            <Text style={typography.context}>Your question: {shownExplanation.question}</Text>
          ) : null}
          <Text style={typography.body}>{shownExplanation.content.observation}</Text>
          {shownExplanation.content.uncertainty ? (
            <Text style={typography.note}>{shownExplanation.content.uncertainty}</Text>
          ) : null}
          {shownExplanation.content.contextQuestion ? (
            <View style={styles.prompt}>
              <Text style={typography.prompt}>{shownExplanation.content.contextQuestion}</Text>
            </View>
          ) : null}
          <RatingButtons disabled={busy} onRate={(judgement) => void rate(judgement)} />
          {feedbackLocation === 'rating' ? feedback : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { gap: 16 },
  inline: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  link: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, textDecorationLine: 'underline' },
  prompt: { borderTopColor: colors.rule, borderTopWidth: 1, gap: 8, paddingTop: 16 }
});
