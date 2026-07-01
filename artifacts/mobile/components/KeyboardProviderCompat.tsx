import { KeyboardProvider } from "react-native-keyboard-controller";
import React from "react";

export default function KeyboardProviderCompat({ children }: { children: React.ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}
