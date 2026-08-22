import { sourceKinds } from "@health-coach/health-core";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>HEALTH INSIGHTS</Text>
        <Text style={styles.title}>Your private health agent starts here.</Text>
        <Text style={styles.body}>
          The first release will join your records into meaningful Health Insights, with evidence and uncertainty in view.
        </Text>
        <Text style={styles.status}>
          Manual capture: {sourceKinds.includes("owner-entry") ? "ready" : "unavailable"}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f7f5",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  eyebrow: {
    color: "#39734f",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    color: "#1d1d20",
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 42,
    marginTop: 12,
  },
  body: {
    color: "#55555a",
    fontSize: 17,
    lineHeight: 26,
    marginTop: 16,
  },
  status: {
    color: "#39734f",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 28,
  },
});
