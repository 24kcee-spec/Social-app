export type SidleProductEvent =
  | "command_palette_opened"
  | "command_destination_opened"
  | "pwa_install_prompted"
  | "pwa_install_accepted"
  | "pwa_install_dismissed"
  | "offline_seen"
  | "recommendation_saved"
  | "recommendation_unsaved"
  | "recommendation_hidden"
  | "recommendation_undo"
  | "recommendation_filter_changed"
  | "why_recommendation_opened";

type EventDetail = {
  name: SidleProductEvent;
  at: string;
  properties?: Record<string, string | number | boolean | null>;
};

const SESSION_KEY = "sidle-product-events-v1";

/**
 * Privacy-conscious client telemetry seam.
 *
 * We intentionally do not transmit anything from this module. It emits a
 * browser CustomEvent and keeps a bounded, session-only diagnostic trail so a
 * future first-party analytics provider can subscribe without scattering SDK
 * calls through product components. Never pass message bodies, emails, names,
 * profile text, precise location or other user-generated content here.
 */
export function trackProductEvent(
  name: SidleProductEvent,
  properties?: Record<string, string | number | boolean | null>,
) {
  if (typeof window === "undefined") return;
  const detail: EventDetail = { name, at: new Date().toISOString(), ...(properties ? { properties } : {}) };
  window.dispatchEvent(new CustomEvent<EventDetail>("sidle:product-event", { detail }));

  try {
    const existing = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "[]") as EventDetail[];
    const next = [...existing.slice(-49), detail];
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    // Telemetry must never block product use when storage is unavailable.
  }
}
