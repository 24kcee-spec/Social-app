"use client";

import { useEffect, useState } from "react";

const NAV_EVENT = "sidle:navigation";

function navigationLabel() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (view === "settings") return "Settings";
  if (view === "notifications") return "Notification settings";
  if (view === "profile-preview") return "Profile preview";

  const section = params.get("section");
  if (section === "profile-details") return "Profile editor";
  if (section === "privacy-settings") return "Privacy and safety settings";
  if (section === "account-sessions") return "Account and security settings";
  if (section === "account-data") return "Account data settings";

  const tab = params.get("tab") ?? "discover";
  return tab === "connections"
    ? "Connections"
    : tab === "messages"
      ? "Messages"
      : tab === "community"
        ? "Community"
        : tab === "profile"
          ? "Profile"
          : "Discover";
}

function syncPrimaryNavigation() {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".app-header nav.nav-pill-bar .nav-pill-btn");
  buttons.forEach((button) => {
    button.setAttribute("type", "button");
    button.removeAttribute("role");
    button.removeAttribute("aria-selected");

    const active = button.classList.contains("active");
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");

    const icon = button.querySelector<HTMLElement>(":scope > span:first-child");
    icon?.setAttribute("aria-hidden", "true");

    const label = button.querySelector<HTMLElement>(":scope > span:nth-child(2)")?.textContent?.trim() ?? "";
    const badge = button.querySelector<HTMLElement>(".nav-badge");
    const count = badge?.textContent?.trim();
    badge?.setAttribute("aria-hidden", "true");

    if (label && count) {
      const suffix = label === "Messages" ? "unread messages" : label === "Connections" ? "pending requests" : "notifications";
      button.setAttribute("aria-label", `${label}, ${count} ${suffix}`);
    } else if (label) {
      button.setAttribute("aria-label", label);
    }
  });
}

function focusNavigationTarget() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const section = params.get("section");
      const sectionTarget = section ? document.getElementById(section) : null;
      const target = sectionTarget ?? document.getElementById("main");
      if (target instanceof HTMLElement) target.focus({ preventScroll: Boolean(sectionTarget) });
    });
  });
}

export function ShellAccessibility() {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let semanticFrame = 0;
    const scheduleSemantics = () => {
      cancelAnimationFrame(semanticFrame);
      semanticFrame = requestAnimationFrame(syncPrimaryNavigation);
    };

    scheduleSemantics();
    const observer = new MutationObserver(scheduleSemantics);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    const announceNavigation = () => {
      scheduleSemantics();
      focusNavigationTarget();
      requestAnimationFrame(() => setAnnouncement(`${navigationLabel()} opened`));
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const patchedPushState: History["pushState"] = function (...args) {
      originalPushState.apply(window.history, args);
      window.dispatchEvent(new Event(NAV_EVENT));
    };
    const patchedReplaceState: History["replaceState"] = function (...args) {
      originalReplaceState.apply(window.history, args);
      window.dispatchEvent(new Event(NAV_EVENT));
    };

    window.history.pushState = patchedPushState;
    window.history.replaceState = patchedReplaceState;
    window.addEventListener(NAV_EVENT, announceNavigation);
    window.addEventListener("popstate", announceNavigation);

    return () => {
      cancelAnimationFrame(semanticFrame);
      observer.disconnect();
      window.removeEventListener(NAV_EVENT, announceNavigation);
      window.removeEventListener("popstate", announceNavigation);
      if (window.history.pushState === patchedPushState) window.history.pushState = originalPushState;
      if (window.history.replaceState === patchedReplaceState) window.history.replaceState = originalReplaceState;
    };
  }, []);

  return (
    <div className="sidle-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
}
