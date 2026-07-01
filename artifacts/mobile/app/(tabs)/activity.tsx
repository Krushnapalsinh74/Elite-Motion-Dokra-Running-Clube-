import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActivityTypeCard } from "@/components/ActivityTypeCard";
import { ActivityType, useActivity } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

const TIPS = [
  { icon: "thermometer" as const, text: "Warm up for 5 minutes before starting" },
  { icon: "droplet" as const, text: "Stay hydrated throughout your activity" },
  { icon: "shield" as const, text: "GPS locks within 30 seconds outdoors" },
];

export default function ActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { startActivity } = useActivity();
  const isWeb = Platform.OS === "web";
  const paddingTop = isWeb ? insets.top + 67 : insets.top + 16;

  async function handleStart(type: ActivityType) {
    await startActivity(type);
    router.push("/tracking");
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Start Activity
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Choose your workout type
          </Text>
        </View>

        <View style={styles.cards}>
          {(["walking", "running", "cycling"] as const).map((type) => (
            <ActivityTypeCard key={type} type={type} onPress={() => handleStart(type)} />
          ))}
        </View>

        <View style={styles.tipsSection}>
          <Text style={[styles.tipsTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Quick tips
          </Text>
          {TIPS.map((tip, i) => (
            <View key={i} style={[styles.tip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.tipIcon, { backgroundColor: colors.primary + "22" }]}>
                <Feather name={tip.icon} size={16} color={colors.primary} />
              </View>
              <Text style={[styles.tipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {tip.text}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 24, marginBottom: 24, gap: 6 },
  title: { fontSize: 28 },
  subtitle: { fontSize: 15 },
  cards: { paddingHorizontal: 24, gap: 12 },
  tipsSection: { paddingHorizontal: 24, marginTop: 32, gap: 10 },
  tipsTitle: { fontSize: 16, marginBottom: 4 },
  tip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tipText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
