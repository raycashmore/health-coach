import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { HealthInvestigationScreen } from './health-investigation-screen';

export function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <HealthInvestigationScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f5'
  }
});
