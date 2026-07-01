import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface MetricDisplayProps {
  value: string;
  label: string;
  unit?: string;
  large?: boolean;
}

export function MetricDisplay({ value, label, unit, large }: MetricDisplayProps) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text
          style={[
            large ? styles.valueLarge : styles.value,
            { color: colors.foreground, fontFamily: "Inter_700Bold" },
          ]}
        >
          {value}
        </Text>
        {unit ? (
          <Text style={[styles.unit, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {unit}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  value: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  valueLarge: {
    fontSize: 48,
    letterSpacing: -1,
  },
  unit: {
    fontSize: 14,
    marginBottom: 2,
  },
  label: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
