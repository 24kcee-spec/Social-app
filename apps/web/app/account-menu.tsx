"use client";

import { useEffect, useId, useRef, useState } from "react";

interface AccountMenuProps {
  displayName: string;
  email: string | null;
  onViewProfile: () => void;
  onEditProfile: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export function AccountMenu({
  displayName,
  email,
  onViewProfile,
  onEditProfile,
  onOpenSettings,
  onSignOut,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    wrapperRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      const items = Array.from(wrapperRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      if (!items.length) return;

      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        items[event.key === "Home" ? 0 : items.length - 1]?.focus();
        return;
      }

      if (event.key === "Tab") {
        setOpen(false);
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      items[(index + direction + items.length) % items.length]?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div
      className="account-menu-anchor"
      ref={wrapperRef}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && wrapperRef.current?.contains(event.relatedTarget)) return;
        setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="user-badge-chip account-menu-trigger"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-avatar-circle" aria-hidden="true">
          {displayName.trim().charAt(0).toUpperCase() || "U"}
        </span>
        <span className="user-chip-text">
          <span className="user-chip-name">{displayName || "Member"}</span>
          <span className="account-menu-hint">Account options</span>
        </span>
        <span className="account-menu-chevron" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
      </button>

      {open ? (
        <div id={menuId} className="account-menu-popover" role="menu" aria-label="Account options">
          <div className="account-menu-identity">
            <strong>{displayName || "Member"}</strong>
            <span>{email || "Email not available"}</span>
          </div>
          <div className="account-menu-divider" role="separator" />
          <button type="button" role="menuitem" onClick={() => choose(onViewProfile)}>
            <span aria-hidden="true">◉</span>
            <span><strong>View my profile</strong><small>See your saved profile as a member would</small></span>
          </button>
          <button type="button" role="menuitem" onClick={() => choose(onEditProfile)}>
            <span aria-hidden="true">✎</span>
            <span><strong>Edit profile</strong><small>Photos, interests, bio and privacy</small></span>
          </button>
          <button type="button" role="menuitem" onClick={() => choose(onOpenSettings)}>
            <span aria-hidden="true">⚙</span>
            <span><strong>Settings</strong><small>Account, appearance and notifications</small></span>
          </button>
          <div className="account-menu-divider" role="separator" />
          <button type="button" role="menuitem" className="account-menu-signout" onClick={() => choose(onSignOut)}>
            <span aria-hidden="true">↪</span>
            <span><strong>Sign out</strong><small>Sign out on this device</small></span>
          </button>
        </div>
      ) : null}
    </div>
  );
}