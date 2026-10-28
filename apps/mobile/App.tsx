import { useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { HealthInvestigationScreen } from './health-investigation-screen';
import { DailyGuidanceScreen } from './daily-guidance-screen';
import { OwnerAccess } from './owner-access';

export function App() {
  const [screen, setScreen] = useState<'daily' | 'investigation'>('daily');
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <OwnerAccess>
          {(ownerId) => (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <Button title="Recent patterns" onPress={() => setScreen('daily')} disabled={screen === 'daily'} />
                <Button
                  title="Investigation & entries"
                  onPress={() => setScreen('investigation')}
                  disabled={screen === 'investigation'}
                />
              </View>
              {screen === 'daily' ? <DailyGuidanceScreen /> : <HealthInvestigationScreen ownerId={ownerId} />}
            </>
          )}
        </OwnerAccess>
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
