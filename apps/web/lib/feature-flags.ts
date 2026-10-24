function enabled(value: string | undefined, defaultValue = true) {
  if (value === undefined) return defaultValue;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

/**
 * Public, build-time product switches for pilot rollout. These are UX flags,
 * never authorization controls. Server/API permissions remain authoritative.
 */
export const webFeatureFlags = Object.freeze({
  commandPalette: enabled(process.env.NEXT_PUBLIC_FEATURE_COMMAND_PALETTE),
  pwaInstallPrompt: enabled(process.env.NEXT_PUBLIC_FEATURE_PWA_INSTALL),
  recommendationTuning: enabled(process.env.NEXT_PUBLIC_FEATURE_RECOMMENDATION_TUNING),
  savedIntroductions: enabled(process.env.NEXT_PUBLIC_FEATURE_SAVED_INTRODUCTIONS),
});
