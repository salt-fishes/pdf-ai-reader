export type AppTheme = "paper" | "night" | "system";
export type MotionPreference = "standard" | "reduced" | "off";
export type ResolvedAppTheme = Exclude<AppTheme, "system">;
export type ResolvedMotion = "full" | "reduced" | "off";

export function isAppTheme(value: unknown): value is AppTheme {
  return value === "paper" || value === "night" || value === "system";
}

export function isMotionPreference(value: unknown): value is MotionPreference {
  return value === "standard" || value === "reduced" || value === "off";
}

/**
 * Existing installs only stored a PDF color mode. Derive the first app theme
 * from that value so the UI keeps its current appearance after the split.
 */
export function initialAppTheme(settings: {
  appTheme?: unknown;
  theme?: unknown;
  colorMode?: unknown;
}): AppTheme {
  if (isAppTheme(settings.appTheme)) return settings.appTheme;
  if (settings.theme === "night") return "night";
  if (settings.colorMode === "night") return "night";
  if (settings.colorMode === "smart" || settings.colorMode === "invert") return "night";
  return "paper";
}

export function initialMotion(settings: { motion?: unknown }): MotionPreference {
  return isMotionPreference(settings.motion) ? settings.motion : "standard";
}

export function resolveAppTheme(preference: AppTheme, systemDark: boolean): ResolvedAppTheme {
  return preference === "system" ? (systemDark ? "night" : "paper") : preference;
}

export function resolveMotion(
  preference: MotionPreference,
  systemReduced: boolean,
): ResolvedMotion {
  if (preference === "off") return "off";
  if (preference === "reduced" || systemReduced) return "reduced";
  return "full";
}
