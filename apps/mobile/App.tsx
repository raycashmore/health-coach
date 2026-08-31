import { SafeAreaView, StyleSheet } from 'react-native';

import { HealthInvestigationScreen } from './health-investigation-screen';

export function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <HealthInvestigationScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f5'
  }
});
