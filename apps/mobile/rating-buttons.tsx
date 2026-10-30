import { StyleSheet, View } from 'react-native';
import { ActionButton } from './action-button';

export type RatingJudgement = 'useful' | 'not-useful' | 'concerning';

const ratings = [
  { judgement: 'useful', label: 'Useful' },
  { judgement: 'not-useful', label: 'Not useful' },
  { judgement: 'concerning', label: 'Concerning' }
] satisfies { judgement: RatingJudgement; label: string }[];

export function RatingButtons({
  disabled,
  onRate,
  selected
}: {
  disabled: boolean;
  onRate: (judgement: RatingJudgement) => void;
  selected?: RatingJudgement | null;
}) {
  return (
    <View style={styles.row}>
      {ratings.map(({ judgement, label }) => (
        <ActionButton
          disabled={disabled}
          key={judgement}
          label={label}
          onPress={() => onRate(judgement)}
          selected={selected === undefined ? undefined : selected === judgement}
          variant="secondary"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }
});
