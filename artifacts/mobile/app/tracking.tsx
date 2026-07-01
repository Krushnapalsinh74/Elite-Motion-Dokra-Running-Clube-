import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import TrackingMap from "@/components/TrackingMap";
import { useActivity } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

const LABELS = { walking: "Walking", running: "Running", cycling: "Cycling" };

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TrackingScreen() {
  const { liveActivity, pauseActivity, resumeActivity, stopActivity, saveActivity, elapsed } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [locked, setLocked] = useState(false);
  const isWeb = Platform.OS === "web";

  const coords = liveActivity?.coords ?? [];
  const lastCoord = coords.length > 0 ? coords[coords.length - 1] : null;
  const distKm = liveActivity ? (liveActivity.distance / 1000).toFixed(2) : "0.00";
  const speed = liveActivity ? liveActivity.currentSpeed.toFixed(1) : "0.0";
  const pace =
    liveActivity && liveActivity.currentSpeed > 0
      ? `${Math.floor(60 / liveActivity.currentSpeed)}:${String(
          Math.round(((60 / liveActivity.currentSpeed) % 1) * 60)
        ).padStart(2, "0")}`
      : "--:--";
  const calories = liveActivity?.calories ?? 0;

  useEffect(() => {
    if (lastCoord && mapRef.current && !isWeb) {
      mapRef.current.animateToRegion(
        {
          latitude: lastCoord.latitude,
          longitude: lastCoord.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        500
      );
    }
  }, [lastCoord, isWeb]);

  useEffect(() => {
    if (!liveActivity && router.canGoBack()) {
      router.back();
    }
  }, [liveActivity]);

  function handlePause() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (liveActivity?.isPaused) {
      resumeActivity();
    } else {
      pauseActivity();
    }
  }

  function handleStop() {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (Platform.OS === "web") {
      finishActivity();
      return;
    }
    Alert.alert("Finish Activity", "Stop and save this activity?", [
      { text: "Cancel", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: finishActivity },
    ]);
  }

  function finishActivity() {
    const activity = stopActivity();
    if (activity) {
      router.replace({
        pathname: "/summary",
        params: { activityId: activity.id, activityJson: JSON.stringify(activity) },
      });
    } else {
      router.replace("/(tabs)/");
    }
  }

  const mapInitialRegion = {
    latitude: lastCoord?.latitude ?? 28.6139,
    longitude: lastCoord?.longitude ?? 77.209,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const polylineCoords = coords.map((c) => ({ latitude: c.latitude, longitude: c.longitude }));
  const isPaused = liveActivity?.isPaused ?? false;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TrackingMap
        mapRef={mapRef}
        initialRegion={mapInitialRegion}
        polylineCoords={polylineCoords}
        isPaused={isPaused}
        primaryColor={colors.primary}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + (isWeb ? 67 : 12) }]}>
        <View style={[styles.statusPill, { backgroundColor: "#000000CC" }]}>
          <View style={[styles.dot, { backgroundColor: isPaused ? "#F59E0B" : "#10B981" }]} />
          <Text style={[styles.statusText, { color: "#fff", fontFamily: "Inter_500Medium" }]}>
            {isPaused ? "Paused" : liveActivity ? LABELS[liveActivity.type] : "Tracking"}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.metricsPanel,
          { backgroundColor: "#000000E6", paddingBottom: insets.bottom + (isWeb ? 34 : 20) },
        ]}
      >
        {isPaused && (
          <View style={[styles.pausedBanner, { backgroundColor: "#F59E0B22", borderColor: "#F59E0B55" }]}>
            <Text style={[styles.pausedText, { color: "#F59E0B", fontFamily: "Inter_600SemiBold" }]}>
              Activity Paused
            </Text>
          </View>
        )}

        <View style={styles.mainMetrics}>
          <View style={styles.bigMetric}>
            <Text style={[styles.bigValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{distKm}</Text>
            <Text style={[styles.bigLabel, { color: "#9E9E9E", fontFamily: "Inter_500Medium" }]}>KM</Text>
          </View>
          <View style={[styles.dividerV, { backgroundColor: "#2A2A2A" }]} />
          <View style={styles.bigMetric}>
            <Text style={[styles.bigValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{fmt(elapsed)}</Text>
            <Text style={[styles.bigLabel, { color: "#9E9E9E", fontFamily: "Inter_500Medium" }]}>TIME</Text>
          </View>
        </View>

        <View style={styles.smallMetrics}>
          <View style={styles.smallMetric}>
            <Text style={[styles.smallValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{speed}</Text>
            <Text style={[styles.smallLabel, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>km/h</Text>
          </View>
          <View style={styles.smallMetric}>
            <Text style={[styles.smallValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{pace}</Text>
            <Text style={[styles.smallLabel, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>/km pace</Text>
          </View>
          <View style={styles.smallMetric}>
            <Text style={[styles.smallValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{calories}</Text>
            <Text style={[styles.smallLabel, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>kcal</Text>
          </View>
        </View>

        {!locked && (
          <View style={styles.buttons}>
            <Pressable
              onPress={() => setLocked(true)}
              style={({ pressed }) => [
                styles.iconBtn,
                { backgroundColor: "#1C1C1C", opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="lock" size={20} color="#9E9E9E" />
            </Pressable>

            <Pressable
              onPress={handlePause}
              style={({ pressed }) => [
                styles.pauseBtn,
                {
                  backgroundColor: isPaused ? colors.primary : "#1C1C1C",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather name={isPaused ? "play" : "pause"} size={28} color="#fff" />
            </Pressable>

            <Pressable
              onPress={handleStop}
              style={({ pressed }) => [
                styles.stopBtn,
                { backgroundColor: "#EF4444", opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="square" size={22} color="#fff" />
            </Pressable>
          </View>
        )}

        {locked && (
          <View style={styles.lockedRow}>
            <Text style={[styles.lockedHint, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>
              Screen locked
            </Text>
            <Pressable
              onPress={() => setLocked(false)}
              style={[styles.unlockBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="unlock" size={16} color="#fff" />
              <Text style={[styles.unlockText, { fontFamily: "Inter_600SemiBold" }]}>Unlock</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13 },
  metricsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 20,
    paddingHorizontal: 24,
    gap: 16,
  },
  pausedBanner: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
  },
  pausedText: { fontSize: 14 },
  mainMetrics: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  bigMetric: { alignItems: "center", gap: 2 },
  bigValue: { fontSize: 48, letterSpacing: -2 },
  bigLabel: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  dividerV: { width: 1, height: 50 },
  smallMetrics: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  smallMetric: { alignItems: "center", gap: 2 },
  smallValue: { fontSize: 22, letterSpacing: -0.5 },
  smallLabel: { fontSize: 11 },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  lockedHint: { fontSize: 14 },
  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  unlockText: { color: "#fff", fontSize: 14 },
});
