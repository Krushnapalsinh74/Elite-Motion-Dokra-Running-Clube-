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

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtPace(minPerKm: number): string {
  if (minPerKm <= 0 || !isFinite(minPerKm)) return "--:--";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return "#10B981"; // green
  if (c >= 0.5) return "#F59E0B"; // amber
  return "#EF4444"; // red
}

export default function TrackingScreen() {
  const { liveMetrics, pauseActivity, resumeActivity, stopActivity, saveActivity } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [locked, setLocked] = useState(false);
  const isWeb = Platform.OS === "web";

  const coords = liveMetrics?.coords ?? [];
  const lastCoord = coords.length > 0 ? coords[coords.length - 1] : null;
  const isPaused = liveMetrics?.isPaused ?? false;
  const elapsed = liveMetrics?.elapsedSeconds ?? 0;
  const distKm = ((liveMetrics?.distanceM ?? 0) / 1000).toFixed(2);
  const speedStr = (liveMetrics?.currentSpeedKmh ?? 0).toFixed(1);
  const pace = fmtPace(liveMetrics?.avgPaceMinPerKm ?? 0);
  const calories = liveMetrics?.calories ?? 0;
  const steps = liveMetrics?.steps ?? 0;
  const cadence = liveMetrics?.cadence ?? 0;
  const confidence = liveMetrics?.confidence ?? 0;
  const isMoving = liveMetrics?.isMoving ?? false;

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
    if (!liveMetrics && router.canGoBack()) {
      router.back();
    }
  }, [liveMetrics]);

  function handlePause() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPaused) {
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

  return (
    <View style={[styles.root, { backgroundColor: "#0A0A0A" }]}>
      <TrackingMap
        mapRef={mapRef}
        initialRegion={mapInitialRegion}
        polylineCoords={polylineCoords}
        isPaused={isPaused}
        primaryColor={colors.primary}
      />

      {/* Top status bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + (isWeb ? 67 : 12) }]}>
        <View style={[styles.statusPill, { backgroundColor: "#000000CC" }]}>
          <View style={[styles.dot, { backgroundColor: isPaused ? "#F59E0B" : isMoving ? "#10B981" : "#9E9E9E" }]} />
          <Text style={[styles.statusText, { color: "#fff", fontFamily: "Inter_500Medium" }]}>
            {isPaused ? "Paused" : isMoving ? (liveMetrics ? LABELS[liveMetrics.type] : "Active") : "Waiting for GPS…"}
          </Text>
        </View>

        {/* GPS Confidence chip */}
        <View style={[styles.confidenceChip, { backgroundColor: "#000000CC" }]}>
          <View style={[styles.dot, { backgroundColor: confidenceColor(confidence) }]} />
          <Text style={[styles.confidenceText, { color: "#fff", fontFamily: "Inter_400Regular" }]}>
            {Math.round(confidence * 100)}% GPS
          </Text>
        </View>
      </View>

      {/* Bottom metrics panel */}
      <View
        style={[
          styles.metricsPanel,
          {
            backgroundColor: "#000000EE",
            paddingBottom: insets.bottom + (isWeb ? 34 : 20),
            borderTopColor: "#2A2A2A",
          },
        ]}
      >
        {isPaused && (
          <View style={[styles.pausedBanner, { backgroundColor: "#F59E0B22", borderColor: "#F59E0B55" }]}>
            <Feather name="pause-circle" size={14} color="#F59E0B" />
            <Text style={[styles.pausedText, { color: "#F59E0B", fontFamily: "Inter_600SemiBold" }]}>
              Activity Paused
            </Text>
          </View>
        )}

        {/* Primary metrics: distance + time */}
        <View style={styles.mainMetrics}>
          <View style={styles.bigMetric}>
            <Text style={[styles.bigValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{distKm}</Text>
            <Text style={[styles.bigLabel, { color: "#9E9E9E", fontFamily: "Inter_500Medium" }]}>KM</Text>
          </View>
          <View style={[styles.dividerV, { backgroundColor: "#2A2A2A" }]} />
          <View style={styles.bigMetric}>
            <Text style={[styles.bigValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{fmtTime(elapsed)}</Text>
            <Text style={[styles.bigLabel, { color: "#9E9E9E", fontFamily: "Inter_500Medium" }]}>TIME</Text>
          </View>
        </View>

        {/* Secondary metrics */}
        <View style={styles.smallMetrics}>
          <View style={styles.smallMetric}>
            <Text style={[styles.smallValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{speedStr}</Text>
            <Text style={[styles.smallLabel, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>km/h</Text>
          </View>
          <View style={styles.smallMetric}>
            <Text style={[styles.smallValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{pace}</Text>
            <Text style={[styles.smallLabel, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>/km</Text>
          </View>
          <View style={styles.smallMetric}>
            <Text style={[styles.smallValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{calories}</Text>
            <Text style={[styles.smallLabel, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>kcal</Text>
          </View>
          {steps > 0 && (
            <View style={styles.smallMetric}>
              <Text style={[styles.smallValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{steps}</Text>
              <Text style={[styles.smallLabel, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>steps</Text>
            </View>
          )}
          {cadence > 0 && (
            <View style={styles.smallMetric}>
              <Text style={[styles.smallValue, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{cadence}</Text>
              <Text style={[styles.smallLabel, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>spm</Text>
            </View>
          )}
        </View>

        {/* Accuracy bar */}
        <View style={styles.accuracyRow}>
          <Text style={[styles.accuracyLabel, { color: "#666", fontFamily: "Inter_400Regular" }]}>
            Accuracy
          </Text>
          <View style={[styles.accuracyTrack, { backgroundColor: "#2A2A2A" }]}>
            <View
              style={[
                styles.accuracyFill,
                {
                  width: `${Math.round(confidence * 100)}%` as `${number}%`,
                  backgroundColor: confidenceColor(confidence),
                },
              ]}
            />
          </View>
          <Text style={[styles.accuracyPct, { color: confidenceColor(confidence), fontFamily: "Inter_600SemiBold" }]}>
            {Math.round(confidence * 100)}%
          </Text>
        </View>

        {/* Control buttons */}
        {!locked ? (
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
        ) : (
          <View style={styles.lockedRow}>
            <Text style={[styles.lockedHint, { color: "#9E9E9E", fontFamily: "Inter_400Regular" }]}>
              Screen locked — tap to unlock
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
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  confidenceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  confidenceText: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13 },
  metricsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 18,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    gap: 14,
  },
  pausedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  pausedText: { fontSize: 14 },
  mainMetrics: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  bigMetric: { alignItems: "center", gap: 2 },
  bigValue: { fontSize: 46, letterSpacing: -2 },
  bigLabel: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  dividerV: { width: 1, height: 50 },
  smallMetrics: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 4,
  },
  smallMetric: { alignItems: "center", gap: 2, minWidth: 50 },
  smallValue: { fontSize: 20, letterSpacing: -0.5 },
  smallLabel: { fontSize: 10 },
  accuracyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accuracyLabel: { fontSize: 11, width: 55 },
  accuracyTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  accuracyFill: {
    height: "100%",
    borderRadius: 2,
  },
  accuracyPct: { fontSize: 12, width: 36, textAlign: "right" },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingBottom: 4,
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
    paddingBottom: 4,
  },
  lockedHint: { fontSize: 13, flex: 1 },
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
