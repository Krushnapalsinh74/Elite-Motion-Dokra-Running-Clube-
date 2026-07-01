import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import TrackingMap from "@/components/TrackingMap";
import { useActivity } from "@/contexts/ActivityContext";
import { useColors } from "@/hooks/useColors";

const LABELS = { walking: "Walking", running: "Running", cycling: "Cycling" };

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmtPace(minPerKm: number): string {
  if (!minPerKm || minPerKm <= 0 || !isFinite(minPerKm) || minPerKm > 60) return "--:--";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function gpsColor(status: string, conf: number): string {
  if (status === "simulated") return "#3B82F6";
  if (status === "locked" || conf >= 0.7) return "#10B981";
  if (status === "acquiring" || conf >= 0.4) return "#F59E0B";
  return "#EF4444";
}

function gpsLabel(status: string, conf: number, elapsed: number): string {
  if (status === "simulated") return "Simulated";
  if (elapsed < 5 || status === "acquiring") return "Acquiring...";
  if (status === "locked") return `${Math.round(conf * 100)}% GPS`;
  if (status === "poor") return "Poor GPS";
  return `${Math.round(conf * 100)}% GPS`;
}

export default function TrackingScreen() {
  const { liveMetrics, pauseActivity, resumeActivity, stopActivity } = useActivity();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Use any to avoid importing MapView type (which crashes web)
  const mapRef = useRef<any>(null);
  const isWeb = Platform.OS === "web";

  const coords = liveMetrics?.coords ?? [];
  const lastCoord = coords.length > 0 ? coords[coords.length - 1] : null;
  const isPaused = liveMetrics?.isPaused ?? false;
  const elapsed = liveMetrics?.elapsedSeconds ?? 0;
  const distKm = ((liveMetrics?.distanceM ?? 0) / 1000).toFixed(2);
  const speed = (liveMetrics?.currentSpeedKmh ?? 0).toFixed(1);
  const pace = fmtPace(liveMetrics?.avgPaceMinPerKm ?? 0);
  const calories = liveMetrics?.calories ?? 0;
  const steps = liveMetrics?.steps ?? 0;
  const cadence = liveMetrics?.cadence ?? 0;
  const confidence = liveMetrics?.confidence ?? 0;
  const gpsStatus = liveMetrics?.gpsStatus ?? "acquiring";
  const isMoving = liveMetrics?.isMoving ?? false;
  const activityType = liveMetrics?.type ?? "running";

  const dotColor = gpsColor(gpsStatus, confidence);
  const statusLabel = gpsLabel(gpsStatus, confidence, elapsed);

  useEffect(() => {
    if (lastCoord && mapRef.current && !isWeb) {
      try {
        mapRef.current.animateToRegion(
          {
            latitude: lastCoord.latitude,
            longitude: lastCoord.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          },
          500
        );
      } catch {}
    }
  }, [lastCoord, isWeb]);

  useEffect(() => {
    if (!liveMetrics && router.canGoBack()) {
      router.back();
    }
  }, [liveMetrics]);

  function handlePause() {
    if (isPaused) resumeActivity();
    else pauseActivity();
  }

  function handleStop() {
    const doStop = () => {
      const activity = stopActivity();
      if (activity) {
        router.replace({
          pathname: "/summary",
          params: { activityJson: JSON.stringify(activity) },
        });
      } else {
        router.replace("/(tabs)/");
      }
    };

    if (Platform.OS === "web") { doStop(); return; }
    Alert.alert("Finish Activity", "Stop and save this activity?", [
      { text: "Cancel", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: doStop },
    ]);
  }

  const initialRegion = {
    latitude: lastCoord?.latitude ?? 28.6139,
    longitude: lastCoord?.longitude ?? 77.209,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  };
  const polylineCoords = coords.map((c) => ({ latitude: c.latitude, longitude: c.longitude }));

  return (
    <View style={[styles.root, { backgroundColor: "#EEF0F3" }]}>
      <TrackingMap
        mapRef={mapRef}
        initialRegion={initialRegion}
        polylineCoords={polylineCoords}
        isPaused={isPaused}
        primaryColor={colors.primary}
      />

      {/* Top status bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + (isWeb ? 67 : 14) }]}>
        <View style={[styles.pill, styles.shadow]}>
          <View style={[styles.dot, { backgroundColor: isPaused ? "#F59E0B" : isMoving ? "#10B981" : "#9E9E9E" }]} />
          <Text style={[styles.pillText, { fontFamily: "Inter_600SemiBold" }]}>
            {isPaused ? "Paused" : LABELS[activityType]}
          </Text>
        </View>

        <View style={[styles.pill, styles.shadow]}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={[styles.pillText, { fontFamily: "Inter_500Medium" }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Bottom panel */}
      <View
        style={[
          styles.panel,
          {
            backgroundColor: "#FFFFFF",
            paddingBottom: insets.bottom + (isWeb ? 34 : 16),
            borderTopColor: colors.border,
          },
        ]}
      >
        {isPaused && (
          <View style={[styles.pauseBanner, { backgroundColor: "#FFF7ED", borderColor: "#FDBA74" }]}>
            <Feather name="pause-circle" size={14} color="#F59E0B" />
            <Text style={[styles.pauseText, { color: "#92400E", fontFamily: "Inter_600SemiBold" }]}>
              Activity Paused
            </Text>
          </View>
        )}

        {/* Primary metrics */}
        <View style={styles.primaryRow}>
          <View style={styles.bigMetric}>
            <Text style={[styles.bigVal, { fontFamily: "Inter_700Bold" }]}>{distKm}</Text>
            <Text style={[styles.bigUnit, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>KM</Text>
          </View>
          <View style={[styles.divV, { backgroundColor: colors.border }]} />
          <View style={styles.bigMetric}>
            <Text style={[styles.bigVal, { fontFamily: "Inter_700Bold" }]}>{fmtTime(elapsed)}</Text>
            <Text style={[styles.bigUnit, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>TIME</Text>
          </View>
        </View>

        {/* Secondary metrics */}
        <View style={styles.secondaryRow}>
          {[
            { val: speed, unit: "km/h" },
            { val: pace, unit: "/km" },
            { val: String(calories), unit: "kcal" },
            ...(steps > 0 ? [{ val: String(steps), unit: "steps" }] : []),
            ...(cadence > 0 ? [{ val: String(cadence), unit: "spm" }] : []),
          ].map((m, i) => (
            <View key={i} style={styles.secStat}>
              <Text style={[styles.secVal, { fontFamily: "Inter_700Bold" }]}>{m.val}</Text>
              <Text style={[styles.secUnit, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{m.unit}</Text>
            </View>
          ))}
        </View>

        {/* Accuracy bar */}
        <View style={styles.accuracyRow}>
          <Text style={[styles.accLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Accuracy</Text>
          <View style={[styles.accTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.accFill, { width: `${Math.round(confidence * 100)}%` as `${number}%`, backgroundColor: dotColor }]} />
          </View>
          <Text style={[styles.accPct, { color: dotColor, fontFamily: "Inter_600SemiBold" }]}>
            {elapsed < 4 ? "—" : `${Math.round(confidence * 100)}%`}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable
            onPress={handlePause}
            style={({ pressed }) => [
              styles.pauseBtn,
              {
                backgroundColor: isPaused ? colors.primary : "#F3F4F6",
                borderColor: isPaused ? colors.primary : colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name={isPaused ? "play" : "pause"} size={28} color={isPaused ? "#fff" : "#111"} />
          </Pressable>

          <Pressable
            onPress={handleStop}
            style={({ pressed }) => [
              styles.stopBtn,
              { backgroundColor: "#EF4444", opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Feather name="square" size={22} color="#fff" />
          </Pressable>
        </View>
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
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#fff",
  },
  shadow: {
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  pillText: { fontSize: 13, color: "#111" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  pauseBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
  },
  pauseText: { fontSize: 13 },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  bigMetric: { alignItems: "center", gap: 2 },
  bigVal: { fontSize: 44, color: "#111", letterSpacing: -2 },
  bigUnit: { fontSize: 11, letterSpacing: 2 },
  divV: { width: 1, height: 48 },
  secondaryRow: { flexDirection: "row", justifyContent: "space-around" },
  secStat: { alignItems: "center", gap: 1 },
  secVal: { fontSize: 19, color: "#111", letterSpacing: -0.5 },
  secUnit: { fontSize: 10 },
  accuracyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  accLabel: { fontSize: 11, width: 55 },
  accTrack: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  accFill: { height: "100%", borderRadius: 2 },
  accPct: { fontSize: 12, width: 36, textAlign: "right" },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingBottom: 4,
  },
  pauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  stopBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
