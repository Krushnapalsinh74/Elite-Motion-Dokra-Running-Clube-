import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useColors } from "@/hooks/useColors";

interface StatRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  value: string;
  label: string;
  sublabel?: string;
}

export function StatRing({
  progress,
  size = 200,
  strokeWidth = 10,
  value,
  label,
  sublabel,
}: StatRingProps) {
  const colors = useColors();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = circumference * (1 - clampedProgress);
  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.value, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {value}
        </Text>
        <Text style={[styles.label, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={[styles.sublabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 42,
    letterSpacing: -1,
    lineHeight: 48,
  },
  label: {
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  sublabel: {
    fontSize: 12,
    marginTop: 2,
  },
});
