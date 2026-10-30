import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { BottomNavigation } from './bottom-navigation';
import type { Destination } from './bottom-navigation';
import { DailyGuidanceScreen } from './daily-guidance-screen';
import { HealthInvestigationScreen } from './health-investigation-screen';
import { OwnerAccess } from './owner-access';
import { colors } from './theme';
import { TopBar } from './top-bar';

export function App() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [destination, setDestination] = useState<Destination>('coach');
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        {fontsLoaded || fontError ? (
          <OwnerAccess>
            {(ownerId, signOut) => (
              <>
                <TopBar onSignOut={signOut} />
                <View style={styles.content}>
                  {destination === 'coach' ? <DailyGuidanceScreen /> : <HealthInvestigationScreen ownerId={ownerId} />}
                </View>
                <BottomNavigation current={destination} onNavigate={setDestination} />
              </>
            )}
          </OwnerAccess>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  screen: { backgroundColor: colors.background, flex: 1 }
});
