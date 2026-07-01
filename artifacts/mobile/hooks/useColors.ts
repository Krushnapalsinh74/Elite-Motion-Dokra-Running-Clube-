import colors from "@/constants/colors";

/**
 * Always returns the light palette — the app uses a clean light theme.
 */
export function useColors() {
  return { ...colors.light, radius: colors.radius };
}
