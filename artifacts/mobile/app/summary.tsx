import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Activity, useActivity } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtPace(minPerKm: number): string {
  if (!minPerKm || minPerKm <= 0 || !isFinite(minPerKm)) return "--:--";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

const LABELS = { walking: "Walking", running: "Running", cycling: "Cycling" };
const ICONS = { walking: "wind" as const, running: "zap" as const, cycling: "activity" as const };

function confidenceLabel(c: number): string {
  if (c >= 0.85) return "Excellent";
  if (c >= 0.7) return "Good";
  if (c >= 0.5) return "Fair";
  return "Low";
}
function confidenceColor(c: number): string {
  if (c >= 0.85) return "#10B981";
  if (c >= 0.7) return "#22C55E";
  if (c >= 0.5) return "#F59E0B";
  return "#EF4444";
}

export default function SummaryScreen() {
  const params = useLocalSearchParams();
  const { saveActivity } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState(false);
  const isWeb = Platform.OS === "web";

  const activity: Activity | null = params.activityJson
    ? (JSON.parse(params.activityJson as string) as Activity)
    : null;

  if (!activity) {
    router.replace("/(tabs)/");
    return null;
  }

  const distKm = (activity.distance / 1000).toFixed(2);
  const conf = activity.confidence ?? 0;

  const STATS = [
    { icon: "map-pin" as const, label: "Distance", value: `${distKm} km` },
    { icon: "clock" as const, label: "Duration", value: fmtDuration(activity.duration) },
    { icon: "trending-up" as const, label: "Avg Pace", value: fmtPace(activity.avgPace) },
    { icon: "zap" as const, label: "Avg Speed", value: `${activity.avgSpeed.toFixed(1)} km/h` },
    { icon: "zap" as const, label: "Calories", value: `${activity.calories} kcal` },
    { icon: "activity" as const, label: "Steps", value: activity.steps > 0 ? String(activity.steps) : "—" },
    {
      icon: "cpu" as const,
      label: "GPS Accuracy",
      value: `${confidenceLabel(conf)} (${Math.round(conf * 100)}%)`,
      valueColor: confidenceColor(conf),
    },
    {
      icon: "calendar" as const,
      label: "Date",
      value: new Date(activity.startTime).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    },
  ];

  async function handleSave() {
    if (saved) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveActivity(activity!);
    setSaved(true);
  }

  async function handleShare() {
    const msg = `Completed a ${LABELS[activity!.type]} with Dokra Running Club!\n${distKm} km · ${fmtDuration(activity!.duration)} · ${activity!.calories} kcal`;
    if (Platform.OS === "web") {
      alert(msg);
      return;
    }
    try {
      await Share.share({ message: msg, title: "Dokra Activity" });
    } catch {}
  }

  function handleDiscard() {
    if (Platform.OS === "web") { router.replace("/(tabs)/"); return; }
    Alert.alert("Discard activity", "This will not be saved.", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.replace("/(tabs)/") },
    ]);
  }

  const paddingTop = isWeb ? insets.top + 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={[colors.primary + "33", colors.background]}
          style={styles.hero}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          <View style={[styles.heroIcon, { backgroundColor: colors.primary + "22" }]}>
            <Feather name={ICONS[activity.type]} size={40} color={colors.primary} />
          </View>
          <Text style={[styles.heroType, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {LABELS[activity.type]} Complete
          </Text>
          <Text style={[styles.heroDistance, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
            {distKm} km
          </Text>

          {/* Accuracy badge */}
          <View style={[styles.confBadge, { backgroundColor: confidenceColor(conf) + "22", borderColor: confidenceColor(conf) + "66" }]}>
            <Feather name="cpu" size={13} color={confidenceColor(conf)} />
            <Text style={[styles.confText, { color: confidenceColor(conf), fontFamily: "Inter_600SemiBold" }]}>
              {confidenceLabel(conf)} accuracy · {Math.round(conf * 100)}%
            </Text>
          </View>

          {saved && (
            <View style={[styles.savedBadge, { backgroundColor: "#10B98122", borderColor: "#10B98155" }]}>
              <Feather name="check-circle" size={14} color="#10B981" />
              <Text style={[styles.savedText, { color: "#10B981", fontFamily: "Inter_600SemiBold" }]}>
                Saved to history
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* Stats grid */}
        <View style={styles.grid}>
          {STATS.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.statIcon, { backgroundColor: colors.primary + "22" }]}>
                <Feather name={s.icon} size={16} color={colors.primary} />
              </View>
              <Text
                style={[
                  styles.statVal,
                  { color: (s as { valueColor?: string }).valueColor ?? colors.foreground, fontFamily: "Inter_700Bold" },
                ]}
              >
                {s.value}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {!saved ? (
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.btnPrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="save" size={18} color="#fff" />
              <Text style={[styles.btnPrimaryText, { fontFamily: "Inter_700Bold" }]}>Save Activity</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.replace("/(tabs)/")}
              style={({ pressed }) => [styles.btnPrimary, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="home" size={18} color="#fff" />
              <Text style={[styles.btnPrimaryText, { fontFamily: "Inter_700Bold" }]}>Back to Home</Text>
            </Pressable>
          )}
          <View style={styles.row}>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.btnSecondary,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="share-2" size={18} color={colors.foreground} />
              <Text style={[styles.btnSecondaryText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Share
              </Text>
            </Pressable>
            {!saved && (
              <Pressable
                onPress={handleDiscard}
                style={({ pressed }) => [
                  styles.btnSecondary,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="trash-2" size={18} color={colors.destructive} />
                <Text style={[styles.btnSecondaryText, { color: colors.destructive, fontFamily: "Inter_600SemiBold" }]}>
                  Discard
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 24, gap: 10 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  heroType: { fontSize: 20 },
  heroDistance: { fontSize: 56, letterSpacing: -2 },
  confBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6,
  },
  confText: { fontSize: 12 },
  savedBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6,
  },
  savedText: { fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 24, gap: 10, marginTop: 8 },
  statCard: { width: "47%", borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 15 },
  statLabel: { fontSize: 12 },
  actions: { paddingHorizontal: 24, marginTop: 24, gap: 12 },
  btnPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, padding: 16, borderRadius: 16,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16 },
  row: { flexDirection: "row", gap: 10 },
  btnSecondary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 14, borderRadius: 14, borderWidth: 1,
  },
  btnSecondaryText: { fontSize: 15 },
});
