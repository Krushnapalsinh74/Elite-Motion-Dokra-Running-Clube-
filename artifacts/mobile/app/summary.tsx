/**
 * Summary screen — shown after finishing an activity.
 * Includes a shareable activity poster captured via react-native-view-shot.
 */

import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
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
import ViewShot, { captureRef } from "react-native-view-shot";

import { Activity, useActivity } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtPace(minPerKm: number): string {
  if (!minPerKm || minPerKm <= 0 || !isFinite(minPerKm) || minPerKm > 60) return "--:--";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function confLabel(c: number): string {
  if (c >= 0.85) return "Excellent";
  if (c >= 0.7) return "Good";
  if (c >= 0.5) return "Fair";
  return "Low";
}
function confColor(c: number): string {
  if (c >= 0.85) return "#10B981";
  if (c >= 0.7) return "#22C55E";
  if (c >= 0.5) return "#F59E0B";
  return "#EF4444";
}

const ICON_MAP = { walking: "wind" as const, running: "zap" as const, cycling: "activity" as const };
const LABEL_MAP = { walking: "Walking", running: "Running", cycling: "Cycling" };

export default function SummaryScreen() {
  const params = useLocalSearchParams();
  const { saveActivity } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const posterRef = useRef<View>(null);
  const [saved, setSaved] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const activity: Activity | null = params.activityJson
    ? JSON.parse(params.activityJson as string)
    : null;

  if (!activity) {
    router.replace("/(tabs)/");
    return null;
  }

  const distKm = (activity.distance / 1000).toFixed(2);
  const conf = activity.confidence ?? 0;
  const isWeb = Platform.OS === "web";

  const STATS = [
    { icon: "map-pin" as const, label: "Distance",   value: `${distKm} km` },
    { icon: "clock" as const,   label: "Duration",   value: fmtDuration(activity.duration) },
    { icon: "trending-up" as const, label: "Avg Pace", value: fmtPace(activity.avgPace) },
    { icon: "zap" as const,     label: "Avg Speed",  value: `${activity.avgSpeed.toFixed(1)} km/h` },
    { icon: "activity" as const,label: "Calories",   value: `${activity.calories} kcal` },
    { icon: "users" as const,   label: "Steps",      value: activity.steps > 0 ? String(activity.steps) : "—" },
    {
      icon: "cpu" as const,
      label: "GPS Accuracy",
      value: `${confLabel(conf)} (${Math.round(conf * 100)}%)`,
      valueColor: confColor(conf),
    },
    {
      icon: "calendar" as const,
      label: "Date",
      value: new Date(activity.startTime).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      }),
    },
  ];

  async function handleSave() {
    if (saved) return;
    await saveActivity(activity!);
    setSaved(true);
  }

  async function handleSharePoster() {
    if (isWeb) {
      const msg = `${LABEL_MAP[activity!.type]} complete!\n${distKm} km · ${fmtDuration(activity!.duration)} · ${activity!.calories} kcal\nTracked with Dokra Running Club`;
      alert(msg);
      return;
    }

    setCapturing(true);
    try {
      const uri = await captureRef(posterRef, { format: "png", quality: 0.95 });
      await Share.share({ url: uri, message: `${LABEL_MAP[activity!.type]} complete — ${distKm} km with Dokra Running Club!` });
    } catch (e) {
      Alert.alert("Share failed", "Could not generate the poster. Please try again.");
    } finally {
      setCapturing(false);
    }
  }

  function handleDiscard() {
    if (isWeb) { router.replace("/(tabs)/"); return; }
    Alert.alert("Discard", "This activity will not be saved.", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.replace("/(tabs)/") },
    ]);
  }

  const paddingTop = isWeb ? insets.top + 67 : insets.top + 8;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ——— Activity Poster (capturable) ——— */}
        <ViewShot ref={posterRef as React.RefObject<ViewShot>} options={{ format: "png", quality: 0.95 }}>
          <View style={[styles.poster, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Brand header */}
            <View style={[styles.posterHeader, { backgroundColor: colors.primary }]}>
              <Text style={[styles.posterBrand, { fontFamily: "Inter_700Bold" }]}>DOKRA</Text>
              <Text style={[styles.posterSub, { fontFamily: "Inter_400Regular" }]}>RUNNING CLUB</Text>
            </View>

            {/* Hero distance */}
            <View style={styles.posterHero}>
              <View style={[styles.posterTypeIcon, { backgroundColor: colors.primary + "22" }]}>
                <Feather name={ICON_MAP[activity.type]} size={32} color={colors.primary} />
              </View>
              <Text style={[styles.posterType, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {LABEL_MAP[activity.type]}
              </Text>
              <Text style={[styles.posterDistance, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                {distKm} km
              </Text>

              {/* Key stats in poster */}
              <View style={styles.posterStats}>
                {[
                  { label: "Time", value: fmtDuration(activity.duration) },
                  { label: "Pace", value: fmtPace(activity.avgPace) },
                  { label: "Calories", value: `${activity.calories} kcal` },
                ].map((s) => (
                  <View key={s.label} style={styles.posterStat}>
                    <Text style={[styles.posterStatVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                      {s.value}
                    </Text>
                    <Text style={[styles.posterStatLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* GPS accuracy */}
              <View style={[styles.confRow, { backgroundColor: confColor(conf) + "18", borderColor: confColor(conf) + "55" }]}>
                <Feather name="cpu" size={12} color={confColor(conf)} />
                <Text style={[styles.confText, { color: confColor(conf), fontFamily: "Inter_600SemiBold" }]}>
                  {confLabel(conf)} GPS accuracy · {Math.round(conf * 100)}%
                </Text>
              </View>

              {/* Date */}
              <Text style={[styles.posterDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {new Date(activity.startTime).toLocaleDateString("en-US", {
                  weekday: "long", month: "long", day: "numeric", year: "numeric",
                })}
              </Text>
            </View>
          </View>
        </ViewShot>

        {/* Full stats grid */}
        <View style={styles.statsGrid}>
          {STATS.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.statIcon, { backgroundColor: colors.primary + "18" }]}>
                <Feather name={s.icon} size={15} color={colors.primary} />
              </View>
              <Text style={[styles.statVal, { color: (s as { valueColor?: string }).valueColor ?? colors.foreground, fontFamily: "Inter_700Bold" }]}>
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
              onPress={handleSharePoster}
              disabled={capturing}
              style={({ pressed }) => [
                styles.btnSecondary,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed || capturing ? 0.7 : 1 },
              ]}
            >
              <Feather name="share-2" size={17} color={colors.foreground} />
              <Text style={[styles.btnSecondaryText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {capturing ? "Generating..." : "Share Poster"}
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
                <Feather name="trash-2" size={17} color={colors.destructive} />
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
  poster: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 4,
  },
  posterHeader: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  posterBrand: { color: "#fff", fontSize: 18, letterSpacing: 4 },
  posterSub: { color: "rgba(255,255,255,0.8)", fontSize: 10, letterSpacing: 2 },
  posterHero: { padding: 20, alignItems: "center", gap: 10 },
  posterTypeIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  posterType: { fontSize: 16 },
  posterDistance: { fontSize: 52, letterSpacing: -2 },
  posterStats: { flexDirection: "row", gap: 20, marginTop: 4 },
  posterStat: { alignItems: "center", gap: 2 },
  posterStatVal: { fontSize: 17 },
  posterStatLabel: { fontSize: 11 },
  confRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  confText: { fontSize: 11 },
  posterDate: { fontSize: 12, marginTop: 4 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    width: "47%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 5,
  },
  statIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 15 },
  statLabel: { fontSize: 11 },
  actions: { paddingHorizontal: 20, marginTop: 20, gap: 10 },
  btnPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, padding: 16, borderRadius: 14,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16 },
  row: { flexDirection: "row", gap: 10 },
  btnSecondary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 14, borderRadius: 12, borderWidth: 1,
  },
  btnSecondaryText: { fontSize: 14 },
});
