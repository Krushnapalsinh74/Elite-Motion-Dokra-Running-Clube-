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

export default function TrackingMap({ polylineCoords = [] }: TrackingMapProps) {
  const count = polylineCoords.length;
  return (
    <View style={styles.placeholder}>
      <Feather name="map" size={48} color="#2A2A2A" />
      <Text style={styles.text}>GPS map tracking active</Text>
      {count > 0 && <Text style={styles.sub}>{count} location points recorded</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  text: { color: "#4A4A4A", fontSize: 15, fontFamily: "Inter_400Regular" },
  sub: { color: "#3A3A3A", fontSize: 12, fontFamily: "Inter_400Regular" },
});
