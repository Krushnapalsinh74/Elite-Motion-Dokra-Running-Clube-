import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface TrackingMapProps {
  mapRef?: unknown;
  initialRegion?: unknown;
  polylineCoords?: unknown[];
  isPaused?: boolean;
  primaryColor?: string;
}

export default function TrackingMap({ polylineCoords = [], isPaused }: TrackingMapProps) {
  const count = (polylineCoords as unknown[]).length;
  return (
    <View style={styles.root}>
      <Feather name="map-pin" size={40} color="#E85D04" />
      <Text style={styles.title}>GPS Tracking Active</Text>
      <Text style={styles.sub}>
        {isPaused ? "Paused" : "Recording your route..."}{count > 0 ? ` · ${count} points` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  title: { color: "#333", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  sub: { color: "#6B7280", fontSize: 13, fontFamily: "Inter_400Regular" },
});
