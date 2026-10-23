import { AuthClientError, type DeviceSession, type Me } from "@sp/auth-client";
import type { Interest, Profile, PromptDefinition, ShareTargetType, SocialStyle } from "@sp/types";
import type { OnboardingInput } from "@sp/validation";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, config, errorMessage, isConfigured } from "./src/auth";
import { Community } from "./src/Community";
import { Connections } from "./src/Connections";
import { Discover } from "./src/Discover";
import { getMessagingClient } from "./src/messagingClient";
import { Messages } from "./src/Messages";
import { NotificationSettingsScreen } from "./src/NotificationSettings";
import { deleteProfileImage, getProfileClient, getSignedMediaUrl, pickAndUploadProfileImage } from "./src/profile";
import { getSafetyClient } from "./src/safetyClient";
import { ThemeProvider, useTheme, type ThemePreference } from "./src/theme";
import { Avatar, Badge, Banner, BottomNav, Button, Chip, Field, type NavTab } from "./src/ui";
import { parseShareUrl, type ProfileClient } from "@sp/profile-client";

const STYLES: { id: SocialStyle; label: string }[] = [
  { id: "small_group", label: "Small groups" },
  { id: "one_to_one", label: "One-to-one" },
  { id: "text_first", label: "Text-first" },
  { id: "voice_first", label: "Voice-first" },
  { id: "low_pressure", label: "Low pressure" },
];

type Mode = "signin" | "signup" | "forgot";
type Phase =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; me: Me }
  | { kind: "error"; message: string };

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { colors, isDark } = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [pendingTarget, setPendingTarget] = useState<{ targetType: ShareTargetType; id: string } | null>(null);

  // Deep linking: cold-start and warm-start URL handlers
  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          const target = parseShareUrl(url);
          if (target) setPendingTarget(target);
        }
      })
      .catch(() => undefined);

    const sub = Linking.addEventListener("url", (event) => {
      const target = parseShareUrl(event.url);
      if (target) setPendingTarget(target);
    });

    return () => sub.remove();
  }, []);

  const load = useCallback(async () => {
    try {
      if (!(await auth.isSignedIn())) return setPhase({ kind: "signedOut" });
      setPhase({ kind: "signedIn", me: await auth.fetchMe() });
    } catch (err) {
      if (err instanceof AuthClientError && (err.code === "unauthorized" || err.code === "not_signed_in")) {
        await auth.signOut().catch(() => undefined);
        return setPhase({ kind: "signedOut" });
      }
      setPhase({ kind: "error", message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      return setPhase({
        kind: "error",
        message: "Supabase is not configured. Fill the repo-root .env and restart Expo.",
      });
    }
    void load();
    return auth.onAuthChange((event) => {
      if (["SIGNED_IN", "SIGNED_OUT"].includes(event)) void load();
    });
  }, [load]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={["top"]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {phase.kind === "loading" && (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading your space…</Text>
        </View>
      )}

      {phase.kind === "error" && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Banner tone="error">{phase.message}</Banner>
            <Button label="Try again" onPress={() => void load()} style={{ marginTop: 14 }} />
          </View>
        </ScrollView>
      )}

      {phase.kind === "signedOut" && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <AuthForm />
        </ScrollView>
      )}

      {phase.kind === "signedIn" && (
        <ProfileHome
          me={phase.me}
          onSignOut={() => setPhase({ kind: "signedOut" })}
          pendingTarget={pendingTarget}
          onClearPendingTarget={() => setPendingTarget(null)}
        />
      )}
    </SafeAreaView>
  );
}

/* ==========================================================================
   Refined Authentication Screen
   ========================================================================== */

function AuthForm() {
  const { colors, radius, space, type, shadow } = useTheme();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        await auth.signIn({ email, password });
      } else if (mode === "signup") {
        const r = await auth.signUp({ email, password, displayName: displayName.trim() || undefined });
        if (r === "confirm_email") setNotice("Check your email and tap the confirmation link, then sign in.");
      } else {
        await auth.requestPasswordReset(email, `${config.webUrl}/reset`);
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderRadius: radius.lg,
          padding: space[5],
        },
        shadow[1],
      ]}
    >
      <View style={styles.authHeader}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>✦ SOCIAL APP</Text>
        <Text style={[styles.h1, { color: colors.text, fontSize: type.display.size - 6 }]}>
          {mode === "signin" ? "Welcome back" : mode === "signup" ? "Join the community" : "Reset password"}
        </Text>
        <Text style={[styles.muted, { color: colors.textMuted, fontSize: type.small.size }]}>
          {mode === "signin"
            ? "Sign in to find people and conversations at your own pace."
            : mode === "signup"
            ? "A calm space for genuine relationships, free of vanity metrics."
            : "Enter your email address and we'll send a secure password reset link."}
        </Text>
      </View>

      {/* Segmented Auth Switcher */}
      <View style={[styles.authSwitch, { backgroundColor: colors.surfaceSunken, borderRadius: radius.sm, padding: 3 }]}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "signin" }}
          onPress={() => {
            setMode("signin");
            setError(null);
            setNotice(null);
          }}
          style={[
            styles.switchBtn,
            mode === "signin" && [styles.switchBtnActive, { backgroundColor: colors.surface, borderRadius: radius.sm - 2 }],
          ]}
        >
          <Text
            style={[
              styles.switchText,
              { color: mode === "signin" ? colors.accent : colors.textMuted, fontWeight: mode === "signin" ? "700" : "500" },
            ]}
          >
            Sign in
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "signup" }}
          onPress={() => {
            setMode("signup");
            setError(null);
            setNotice(null);
          }}
          style={[
            styles.switchBtn,
            mode === "signup" && [styles.switchBtnActive, { backgroundColor: colors.surface, borderRadius: radius.sm - 2 }],
          ]}
        >
          <Text
            style={[
              styles.switchText,
              { color: mode === "signup" ? colors.accent : colors.textMuted, fontWeight: mode === "signup" ? "700" : "500" },
            ]}
          >
            Create account
          </Text>
        </Pressable>
      </View>

      {mode === "signup" ? (
        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="e.g. Maya Lin"
        />
      ) : null}

      <Field
        label="Email address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {mode !== "forgot" ? (
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secure
          placeholder="••••••••"
        />
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}

      <Button
        label={busy ? "Please wait…" : mode === "forgot" ? "Send reset link" : mode === "signin" ? "Sign in" : "Create account"}
        onPress={() => void submit()}
        disabled={busy || !email.trim() || (mode !== "forgot" && !password.trim())}
        style={{ marginTop: space[4] }}
      />

      <View style={styles.authFooterRow}>
        {mode === "signin" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode("forgot");
              setError(null);
            }}
            hitSlop={8}
          >
            <Text style={[styles.linkText, { color: colors.accent }]}>Forgot password?</Text>
          </Pressable>
        ) : mode === "forgot" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode("signin");
              setError(null);
            }}
            hitSlop={8}
          >
            <Text style={[styles.linkText, { color: colors.accent }]}>← Back to sign in</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ==========================================================================
   Authenticated Shell with Bottom Navigation
   ========================================================================== */

function ProfileHome({
  me,
  onSignOut,
  pendingTarget,
  onClearPendingTarget,
}: {
  me: Me;
  onSignOut: () => void;
  pendingTarget?: { targetType: ShareTargetType; id: string } | null;
  onClearPendingTarget?: () => void;
}) {
  const { colors, radius, space, type } = useTheme();
  const client = useMemo<ProfileClient>(() => getProfileClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [prompts, setPrompts] = useState<PromptDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<NavTab>("discover");
  const [shellView, setShellView] = useState<"app" | "settings" | "viewProfile" | "notifications">("app");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [pendingIn, setPendingIn] = useState(0);
  const [unread, setUnread] = useState(0);
  const [chatWith, setChatWith] = useState<string | null>(null);

  // Cross-device deep link destination restoration
  useEffect(() => {
    if (!pendingTarget) return;
    if (pendingTarget.targetType === "group" || pendingTarget.targetType === "event") {
      setTab("community");
    } else if (pendingTarget.targetType === "profile") {
      setTab("discover");
      onClearPendingTarget?.();
    }
  }, [pendingTarget, onClearPendingTarget]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, i, pr] = await Promise.all([
        client.getProfile(),
        client.listInterests(),
        client.listPrompts(),
      ]);
      setProfile(p);
      setInterests(i);
      setPrompts(pr);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep unread messages badge warm
  useEffect(() => {
    const tick = () =>
      getMessagingClient()
        .listConversations()
        .then((l) => setUnread(l.reduce((n, c) => n + c.unreadCount, 0)))
        .catch(() => undefined);
    void tick();
    const t = setInterval(tick, 45000);
    return () => clearInterval(t);
  }, []);

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          auth.signOut().then(onSignOut).catch((err) => setError(errorMessage(err)));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading your profile…</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Banner tone="error">{error ?? "Profile unavailable."}</Banner>
          <Button label="Retry" onPress={() => void load()} style={{ marginTop: 14 }} />
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.mainContainer}>
      {/* Editorial App Header */}
      <View
        style={[
          styles.topHeader,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.line,
            paddingHorizontal: space[4],
            paddingVertical: space[3],
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerEyebrow, { color: colors.accent }]}>✦ SOCIAL APP</Text>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: type.title.size }]}>
            {!profile.onboardingCompleted
              ? "Complete Profile"
              : shellView === "settings"
              ? "Settings"
              : shellView === "notifications"
              ? "Notifications"
              : shellView === "viewProfile"
              ? "Your profile"
              : tab === "discover"
              ? "Discover"
              : tab === "connections"
              ? "Connections"
              : tab === "messages"
              ? "Messages"
              : tab === "community"
              ? "Community"
              : "Your Space"}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open account menu for ${profile.displayName || "member"}`}
          accessibilityHint="Opens profile, settings and sign-out options"
          onPress={() => setAccountMenuOpen(true)}
          style={({ pressed }) => ({
            minHeight: 44,
            maxWidth: 150,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 8,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 24,
            backgroundColor: colors.surfaceSunken,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <View style={{
            width: 32, height: 32, borderRadius: 16,
            alignItems: "center", justifyContent: "center",
            backgroundColor: colors.accentSoft,
          }}>
            <Text style={{ color: colors.accent, fontWeight: "800" }}>
              {profile.displayName.trim().charAt(0).toUpperCase() || "S"}
            </Text>
          </View>
          <Text numberOfLines={1} style={{ maxWidth: 78, color: colors.text, fontSize: 12, fontWeight: "700" }}>
            {profile.displayName || "Account"} ⌄
          </Text>
        </Pressable>
      </View>

      {error ? <Banner tone="error">{error}</Banner> : null}

      {/* Main Body */}
      <View style={styles.contentArea}>
        {!profile.onboardingCompleted ? (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Onboarding
              profile={profile}
              interests={interests}
              prompts={prompts}
              client={client}
              onDone={setProfile}
            />
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            {shellView === "settings" ? (
              <MobileSettingsOverview
                me={me}
                profile={profile}
                onVerifyStudent={async (email, id, inst) => {
                  const res = await client.verifyStudent({ studentEmail: email, studentId: id, institution: inst });
                  if (res.verified) {
                    const refreshed = await client.getProfile();
                    setProfile(refreshed);
                  } else {
                    throw new Error(res.message);
                  }
                }}
                onBack={() => setShellView("app")}
                onEditProfile={() => { setShellView("app"); setTab("profile"); }}
                onOpenNotifications={() => setShellView("notifications")}
                onViewProfile={() => setShellView("viewProfile")}
                onSignOut={onSignOut}
              />
            ) : shellView === "notifications" ? (
              <NotificationSettingsScreen onBack={() => setShellView("settings")} />
            ) : shellView === "viewProfile" ? (
              <MobileMyProfileView
                profile={profile}
                onBack={() => setShellView("app")}
                onEdit={() => { setShellView("app"); setTab("profile"); }}
              />
            ) : tab === "discover" ? (
              <Discover />
            ) : tab === "connections" ? (
              <Connections
                onCount={setPendingIn}
                onMessage={(userId) => {
                  setChatWith(userId);
                  setTab("messages");
                }}
              />
            ) : tab === "messages" ? (
              <Messages
                onUnread={setUnread}
                openWithUserId={chatWith}
                onOpened={() => setChatWith(null)}
              />
            ) : tab === "community" ? (
              <Community initialTarget={pendingTarget} onClearTarget={onClearPendingTarget} />
            ) : (
              <Editor
                profile={profile}
                interests={interests}
                prompts={prompts}
                client={client}
                me={me}
                onSaved={setProfile}
              />
            )}
          </ScrollView>
        )}
      </View>

      {/* Bottom Navigation (Only visible when onboarding is complete) */}
      {profile.onboardingCompleted && shellView === "app" ? (
        <BottomNav
          currentTab={tab}
          onSelectTab={(nextTab) => { setShellView("app"); setTab(nextTab); }}
          pendingConnectionsCount={pendingIn}
          unreadMessagesCount={unread}
        />
      ) : null}

      <Modal
        visible={accountMenuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAccountMenuOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-start", alignItems: "flex-end", padding: 16, paddingTop: 70, backgroundColor: "rgba(8,12,22,0.48)" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close account menu"
            onPress={() => setAccountMenuOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={{
            width: "100%",
            maxWidth: 360,
            padding: 16,
            gap: 10,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
          }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Your account</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 4 }}>{me.email || "Email not available"}</Text>
            <Button label="View my profile" secondary onPress={() => { setAccountMenuOpen(false); setShellView("viewProfile"); }} />
            <Button label="Edit profile" secondary onPress={() => { setAccountMenuOpen(false); setShellView("app"); setTab("profile"); }} />
            <Button label="Settings" onPress={() => { setAccountMenuOpen(false); setShellView("settings"); }} />
            <Button label="Sign out" danger secondary onPress={() => { setAccountMenuOpen(false); handleSignOut(); }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ==========================================================================
   Settings Overview (mobile)
   ========================================================================== */

function MobileSettingsOverview({
  me,
  profile,
  onVerifyStudent,
  onBack,
  onEditProfile,
  onOpenNotifications,
  onViewProfile,
  onSignOut,
}: {
  me: Me;
  profile?: Profile | null;
  onVerifyStudent?: (studentEmail: string, studentId?: string, institution?: string) => Promise<void>;
  onBack: () => void;
  onEditProfile: () => void;
  onOpenNotifications: () => void;
  onViewProfile: () => void;
  onSignOut: () => void;
}) {
  const { colors, radius, space, type, preference, setPreference, shadow } = useTheme();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const isStudentVerified = profile?.verificationLevel === "student_verified";
  const [studentEmail, setStudentEmail] = useState(
    me.email?.includes("@students.") || me.email?.includes(".ac.zw") ? me.email : ""
  );
  const [studentId, setStudentId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSecurityError(null);
    try {
      setSessions(await auth.listSessions());
    } catch (err) {
      setSecurityError(errorMessage(err));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const confirmRevokeSession = (session: DeviceSession) => {
    Alert.alert(
      "Sign out this device?",
      "That device will need to sign in again to use this account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            setRevokingSessionId(session.id);
            setSecurityError(null);
            try {
              await auth.revokeSession(session.id);
              await loadSessions();
            } catch (err) {
              setSecurityError(errorMessage(err));
            } finally {
              setRevokingSessionId(null);
            }
          },
        },
      ],
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account and personal data?",
      "This permanently deletes your Social account and cannot be undone. Make sure you really want to continue.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            setSecurityError(null);
            try {
              await getSafetyClient().deleteAccount();
              await auth.signOut().catch(() => undefined);
              onSignOut();
            } catch (err) {
              setSecurityError(errorMessage(err));
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ gap: space[3] }}>
      <View style={{ marginBottom: space[2], flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR SPACE</Text>
          <Text style={[styles.h1, { color: colors.text, fontSize: type.title.size }]}>Settings</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>Manage your profile, privacy, account security, notifications and appearance.</Text>
        </View>
        <Button label="Back" secondary compact onPress={onBack} />
      </View>

      <View style={[styles.card, { padding: space[4], borderRadius: radius.md, borderColor: colors.line, backgroundColor: colors.surface }, shadow[1]]}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>SIGNED IN</Text>
        <Text style={[styles.h2, { color: colors.text }]}>{me.email || "Email not available"}</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>Account status: {me.status}</Text>
      </View>

      {/* Campus Verification Card */}
      <View
        style={[
          styles.card,
          {
            padding: space[4],
            borderRadius: radius.md,
            borderColor: isStudentVerified ? colors.accentLine : colors.line,
            backgroundColor: colors.surface,
            gap: space[2],
          },
          shadow[1],
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>CAMPUS VERIFICATION</Text>
          {isStudentVerified ? (
            <Badge label="✓ Campus Verified" tone="success" compact />
          ) : (
            <Badge label="Unverified" tone="neutral" compact />
          )}
        </View>

        <Text style={[styles.h2, { color: colors.text }]}>
          {isStudentVerified ? "Verified Campus Student" : "Verify Student Standing"}
        </Text>

        <Text style={[styles.muted, { color: colors.textMuted }]}>
          {isStudentVerified
            ? "Your campus status is confirmed. You display the '✓ Campus Verified' badge across Discover, Connections, and Messages."
            : "Connect your official university or college email (e.g. @students.nust.ac.zw or *.ac.zw) to unlock the Campus Verified badge."}
        </Text>

        {!isStudentVerified && onVerifyStudent ? (
          <View style={{ marginTop: space[2], gap: space[2] }}>
            <Field
              label="University Email"
              value={studentEmail}
              placeholder="e.g. n0241234x@students.nust.ac.zw"
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setStudentEmail}
            />

            <Field
              label="Student ID / Reg No (Optional)"
              value={studentId}
              placeholder="e.g. N0241234X"
              autoCapitalize="characters"
              onChangeText={setStudentId}
            />

            {verifyMsg ? <Banner tone="success">{verifyMsg}</Banner> : null}
            {verifyError ? <Banner tone="error">{verifyError}</Banner> : null}

            <Button
              label={verifying ? "Verifying…" : "Verify Student Status"}
              disabled={verifying || !studentEmail.trim()}
              onPress={async () => {
                if (!studentEmail.trim()) return;
                setVerifying(true);
                setVerifyError(null);
                setVerifyMsg(null);
                try {
                  await onVerifyStudent(studentEmail.trim(), studentId.trim() || undefined);
                  setVerifyMsg("Campus status verified! Your profile now carries the verified badge.");
                } catch (err) {
                  setVerifyError(errorMessage(err));
                } finally {
                  setVerifying(false);
                }
              }}
            />
          </View>
        ) : null}
      </View>

      <MobileSettingRow
        title="View my profile"
        description="See the saved profile details other members can read."
        onPress={onViewProfile}
      />
      <MobileSettingRow
        title="Profile & privacy"
        description="Edit your bio, interests, photos, conversation prompts and discovery permissions."
        onPress={onEditProfile}
      />
      <MobileSettingRow
        title="Notifications"
        description="Manage new-message and connection-request notification preferences."
        onPress={onOpenNotifications}
      />

      <View style={[styles.card, { padding: space[4], borderRadius: radius.md, borderColor: colors.line, backgroundColor: colors.surface, gap: space[3] }, shadow[1]]}>
        <View style={{ gap: 4 }}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>SECURITY</Text>
          <Text style={[styles.h2, { color: colors.text }]}>Account & security</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>Review where your account is signed in and end sessions you no longer recognize.</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>Active sessions</Text>
          <Button label={sessionsLoading ? "Loading…" : "Refresh"} compact secondary onPress={() => void loadSessions()} disabled={sessionsLoading || revokingSessionId !== null} />
        </View>
        {securityError ? <Banner tone="error">{securityError}</Banner> : null}
        {sessionsLoading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.muted, { color: colors.textMuted }]}>Loading active sessions…</Text>
          </View>
        ) : sessions.length ? (
          <View style={{ gap: space[2] }}>
            {sessions.map((session) => (
              <View key={session.id} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: space[3], gap: 8 }}>
                <View style={{ gap: 3 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    {session.current ? "This device" : "Signed-in device"}
                  </Text>
                  <Text style={[styles.muted, { color: colors.textMuted, fontSize: 12 }]} numberOfLines={2}>
                    {session.userAgent || "Device details unavailable"}
                  </Text>
                  <Text style={[styles.muted, { color: colors.textMuted, fontSize: 12 }]}>
                    Last active {new Date(session.lastSeenAt).toLocaleString()}
                  </Text>
                </View>
                {!session.current ? (
                  <Button
                    label={revokingSessionId === session.id ? "Signing out…" : "Sign out this device"}
                    secondary
                    danger
                    compact
                    disabled={revokingSessionId !== null || deletingAccount}
                    onPress={() => confirmRevokeSession(session)}
                  />
                ) : (
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>Current session</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.muted, { color: colors.textMuted }]}>No active sessions were returned.</Text>
        )}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space[3], gap: 8 }}>
          <Text style={[styles.h2, { color: colors.text }]}>Delete account</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>Permanently delete your Social account and personal data. This cannot be undone.</Text>
          <Button
            label={deletingAccount ? "Deleting account…" : "Delete my account"}
            danger
            secondary
            onPress={confirmDeleteAccount}
            disabled={deletingAccount || revokingSessionId !== null}
          />
        </View>
      </View>

      <View style={[styles.card, { padding: space[4], borderRadius: radius.md, borderColor: colors.line, backgroundColor: colors.surface }, shadow[1]]}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>PERSONALISE</Text>
        <Text style={[styles.h2, { color: colors.text }]}>Appearance</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>System follows your device setting. Your selection is saved on this device.</Text>
        <View style={[styles.themeRow, { marginTop: space[3] }]}>
          {(["system", "light", "dark"] as ThemePreference[]).map((mode) => (
            <Chip
              key={mode}
              label={mode === "system" ? "◐ System" : mode === "light" ? "☀ Light" : "☾ Dark"}
              selected={preference === mode}
              onPress={() => setPreference(mode)}
            />
          ))}
        </View>
      </View>

      <View style={[styles.card, { padding: space[4], borderRadius: radius.md, borderColor: colors.line, backgroundColor: colors.surface }, shadow[1]]}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>HELP & SAFETY</Text>
        <Text style={[styles.h2, { color: colors.text }]}>Keep your space comfortable</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>Use Report and Block where available on profiles, connections, messages, groups and events. You can manage your current sessions and account-removal request here.</Text>
      </View>
    </View>
  );
}
function MobileSettingRow({ title, description, onPress }: { title: string; description: string; onPress: () => void }) {
  const { colors, radius, space, shadow } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          flexDirection: "row",
          alignItems: "center",
          gap: space[3],
          padding: space[4],
          borderRadius: radius.md,
          borderColor: colors.line,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.78 : 1,
        },
        shadow[1],
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>{description}</Text>
      </View>
      <Text style={{ color: colors.accent, fontSize: 18 }}>→</Text>
    </Pressable>
  );
}

function MobileMyProfileView({ profile, onBack, onEdit }: { profile: Profile; onBack: () => void; onEdit: () => void }) {
  const { colors, radius, space, type, shadow } = useTheme();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!profile.media[0]) { setMediaUrl(null); return () => { active = false; }; }
    void getSignedMediaUrl(profile.media[0].thumbnailPath)
      .then((url) => { if (active) setMediaUrl(url); })
      .catch(() => { if (active) setMediaUrl(null); });
    return () => { active = false; };
  }, [profile.media]);

  const socialLabels: Record<SocialStyle, string> = {
    small_group: "Small groups",
    one_to_one: "One-to-one",
    text_first: "Text-first",
    voice_first: "Voice-first",
    low_pressure: "Low pressure",
  };
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>PROFILE PREVIEW</Text>
          <Text style={[styles.h1, { color: colors.text, fontSize: type.title.size }]}>Your profile</Text>
        </View>
        <Button label="Back" secondary compact onPress={onBack} />
      </View>
      <View style={[styles.card, { padding: space[4], borderRadius: radius.md, borderColor: colors.line, backgroundColor: colors.surface, gap: space[3] }, shadow[1]]}>
        {mediaUrl ? (
          <Image source={{ uri: mediaUrl }} accessibilityLabel={`${profile.displayName} profile photo`} style={{ width: "100%", aspectRatio: 1, maxHeight: 320, borderRadius: radius.md }} />
        ) : (
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", alignSelf: "center" }}>
            <Text style={{ color: colors.accent, fontSize: 32, fontWeight: "800" }}>{profile.displayName.trim().charAt(0).toUpperCase() || "S"}</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={[styles.h1, { color: colors.text, fontSize: type.title.size }]}>{profile.displayName}</Text>
          {profile.verificationLevel === "student_verified" ? (
            <Badge label="✓ Campus Verified" tone="success" compact />
          ) : profile.verificationLevel === "trusted" ? (
            <Badge label="✓ Verified" tone="accent" compact />
          ) : null}
        </View>
        <Text style={[styles.muted, { color: colors.textMuted }]}>{profile.bio || "No bio added yet."}</Text>
        <Text style={[styles.h2, { color: colors.text, marginTop: space[2] }]}>How I like to connect</Text>
        <View style={styles.chipsRow}>
          {profile.socialStyles.map((style) => <Chip key={style} label={socialLabels[style]} selected />)}
          {!profile.socialStyles.length ? <Text style={[styles.muted, { color: colors.textMuted }]}>No connection preferences added yet.</Text> : null}
        </View>
        <Text style={[styles.h2, { color: colors.text, marginTop: space[2] }]}>Interests</Text>
        <View style={styles.chipsRow}>
          {profile.interests.map((interest) => <Chip key={interest.id} label={interest.name} selected={false} />)}
          {!profile.interests.length ? <Text style={[styles.muted, { color: colors.textMuted }]}>No interests added yet.</Text> : null}
        </View>
        <Text style={[styles.h2, { color: colors.text, marginTop: space[2] }]}>Conversation starters</Text>
        {profile.prompts.filter((p) => p.answer.trim()).map((p) => (
          <View key={p.promptId} style={{ padding: space[3], borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, gap: 4 }}>
            <Text style={{ color: colors.accent, fontWeight: "800" }}>{p.prompt}</Text>
            <Text style={{ color: colors.text }}>{p.answer}</Text>
          </View>
        ))}
        {!profile.prompts.some((p) => p.answer.trim()) ? <Text style={[styles.muted, { color: colors.textMuted }]}>Add a prompt answer to help others start a conversation.</Text> : null}
        <Button label="Edit profile" onPress={onEdit} style={{ marginTop: space[2] }} />
      </View>
    </View>
  );
}

/* ==========================================================================
   Refined Onboarding Experience
   ========================================================================== */

function Onboarding({
  profile,
  interests,
  prompts,
  client,
  onDone,
}: {
  profile: Profile;
  interests: Interest[];
  prompts: PromptDefinition[];
  client: ProfileClient;
  onDone: (p: Profile) => void;
}) {
  const { colors, radius, space, type, shadow } = useTheme();

  const [displayName, setDisplayName] = useState(profile.displayName === "New member" ? "" : profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [stylesList, setStylesList] = useState<SocialStyle[]>(
    profile.socialStyles.length ? profile.socialStyles : ["low_pressure"]
  );
  const [privacy, setPrivacy] = useState(profile.privacy);
  const [selected, setSelected] = useState<string[]>([]);
  const [chosenPrompts, setChosenPrompts] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: OnboardingInput = {
        displayName: displayName.trim(),
        bio: bio.trim(),
        socialStyles: stylesList,
        privacy,
        interests: selected.map((interestId) => ({ interestId, strength: 2 as const })),
        answers: chosenPrompts.map((promptId) => ({ promptId, answer: (answers[promptId] ?? "").trim() })),
      };
      onDone(await client.completeOnboarding(input));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space[4] }}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>STEP 1 · BASICS</Text>
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>About you</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>
          Basic information to introduce yourself. You can change this anytime.
        </Text>

        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="e.g. Tendai Moyo"
        />

        <Field
          label="Bio"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={280}
          placeholder="What are your passions, hobbies, or current projects?"
        />

        <Text style={[styles.fieldLabel, { color: colors.text, marginTop: space[3] }]}>
          Social style (select all that fit)
        </Text>
        <View style={styles.chipsRow}>
          {STYLES.map((x) => {
            const isSelected = stylesList.includes(x.id);
            return (
              <Chip
                key={x.id}
                label={isSelected ? `✓ ${x.label}` : x.label}
                selected={isSelected}
                onPress={() =>
                  setStylesList((prev) => (prev.includes(x.id) ? prev.filter((item) => item !== x.id) : [...prev, x.id]))
                }
              />
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>STEP 2 · INTERESTS</Text>
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>What do you enjoy?</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>Choose at least 3 interests to help find genuine matches.</Text>

        <View style={styles.chipsRow}>
          {interests.map((i) => {
            const isSelected = selected.includes(i.id);
            return (
              <Chip
                key={i.id}
                label={isSelected ? `✓ ${i.name}` : i.name}
                selected={isSelected}
                onPress={() =>
                  setSelected((prev) => (prev.includes(i.id) ? prev.filter((id) => id !== i.id) : [...prev, i.id]))
                }
              />
            );
          })}
        </View>
        <Text style={[styles.counter, { color: selected.length >= 3 ? colors.success : colors.danger, marginTop: space[2] }]}>
          {selected.length} of 3 required selected
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>STEP 3 · PROMPTS</Text>
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>Conversation starters</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>Pick 1–3 prompts to show on your profile.</Text>

        <View style={{ gap: space[3], marginTop: space[2] }}>
          {prompts.map((p) => {
            const chosen = chosenPrompts.includes(p.id);
            return (
              <View
                key={p.id}
                style={[
                  styles.promptCard,
                  {
                    borderColor: chosen ? colors.accentLine : colors.line,
                    backgroundColor: chosen ? colors.accentSoft : colors.surfaceSunken,
                    borderRadius: radius.sm,
                    padding: space[3],
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: chosen }}
                  onPress={() =>
                    setChosenPrompts((cur) =>
                      chosen ? cur.filter((id) => id !== p.id) : cur.length < 3 ? [...cur, p.id] : cur
                    )
                  }
                  style={styles.promptCheckRow}
                >
                  <Text style={[styles.radioMark, { color: chosen ? colors.accent : colors.textMuted }]}>
                    {chosen ? "☑" : "☐"}
                  </Text>
                  <Text style={[styles.promptText, { color: chosen ? colors.accent : colors.text }]}>
                    {p.prompt}
                  </Text>
                </Pressable>

                {chosen ? (
                  <TextInput
                    style={[
                      styles.textarea,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.lineStrong,
                        color: colors.text,
                        borderRadius: radius.sm,
                        padding: space[2],
                        marginTop: space[2],
                      },
                    ]}
                    value={answers[p.id] ?? ""}
                    onChangeText={(v) => setAnswers((a) => ({ ...a, [p.id]: v }))}
                    multiline
                    maxLength={240}
                    placeholder="Write your honest answer…"
                    placeholderTextColor={colors.textMuted}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
        <Text style={[styles.counter, { color: chosenPrompts.length >= 1 ? colors.success : colors.danger, marginTop: space[2] }]}>
          {chosenPrompts.length} of 1–3 selected
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>STEP 4 · PRIVACY</Text>
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>Privacy & controls</Text>
        <PrivacyEditor privacy={privacy} setPrivacy={setPrivacy} />

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Button
          label={busy ? "Saving profile…" : "Complete setup"}
          onPress={() => void save()}
          disabled={busy || displayName.trim().length < 2 || selected.length < 3 || chosenPrompts.length < 1}
          style={{ marginTop: space[4] }}
        />
      </View>
    </View>
  );
}

/* ==========================================================================
   Refined Profile Editor & Settings Tab
   ========================================================================== */

function Editor({
  profile,
  interests,
  prompts,
  client,
  me,
  onSaved,
}: {
  profile: Profile;
  interests: Interest[];
  prompts: PromptDefinition[];
  client: ProfileClient;
  me: Me;
  onSaved: (p: Profile) => void;
}) {
  const { colors, radius, space, type, preference, setPreference, shadow } = useTheme();

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [stylesList, setStylesList] = useState(profile.socialStyles);
  const [privacy, setPrivacy] = useState(profile.privacy);
  const [selected, setSelected] = useState(profile.interests.map((i) => i.id));
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(profile.prompts.map((p) => [p.promptId, p.answer]))
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const refreshMedia = useCallback(async () => {
    const pairs = await Promise.all(
      profile.media.map(async (m) => [m.id, await getSignedMediaUrl(m.thumbnailPath)] as const)
    );
    setMediaUrls(Object.fromEntries(pairs));
  }, [profile.media]);

  useEffect(() => {
    void refreshMedia().catch(() => undefined);
  }, [refreshMedia]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let next = await client.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        socialStyles: stylesList,
        privacy,
      });
      next = await client.updateInterests({
        interests: selected.map((interestId) => ({ interestId, strength: 2 as const })),
      });
      next = await client.updatePrompts({
        answers: Object.entries(answers)
          .filter(([, v]) => v.trim())
          .slice(0, 3)
          .map(([promptId, answer]) => ({ promptId, answer: answer.trim() })),
      });
      onSaved(next);
      setMessage("Profile saved successfully.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = async () => {
    setError(null);
    try {
      const media = await pickAndUploadProfileImage(profile.media);
      if (media) {
        onSaved({ ...profile, media: [...profile.media, media] });
        setMessage("Photo added.");
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const removePhoto = (mediaId: string) => {
    const media = profile.media.find((m) => m.id === mediaId);
    if (!media) return;
    Alert.alert("Remove photo?", "Are you sure you want to remove this photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteProfileImage(media);
            onSaved({ ...profile, media: profile.media.filter((m) => m.id !== mediaId) });
            setMessage("Photo removed.");
          } catch (err) {
            setError(errorMessage(err));
          }
        },
      },
    ]);
  };

  return (
    <View style={{ gap: space[4], paddingBottom: 32 }}>
      {/* Profile Overview Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <View style={styles.profileHeaderRow}>
          <Avatar
            name={profile.displayName}
            url={profile.media[0] ? mediaUrls[profile.media[0].id] : null}
            size="xl"
          />
          <View style={{ flex: 1, marginLeft: space[4] }}>
            <Text style={[styles.name, { color: colors.text, fontSize: type.heading.size - 4 }]}>
              {profile.displayName}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted, fontSize: type.small.size }]}>
              {me.email ?? me.phone}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {profile.socialStyles.map((s) => (
                <Chip key={s} label={STYLES.find((x) => x.id === s)?.label ?? s} accent />
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Appearance Preference */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>Appearance</Text>
        <Text style={[styles.muted, { color: colors.textMuted, fontSize: type.small.size }]}>
          Choose your visual theme. System follows your device's mode automatically.
        </Text>
        <View style={[styles.themeRow, { marginTop: space[3] }]}>
          {(["system", "light", "dark"] as ThemePreference[]).map((mode) => {
            const isSelected = preference === mode;
            return (
              <Chip
                key={mode}
                label={mode === "system" ? "⚙ System" : mode === "light" ? "☀ Light" : "☾ Dark"}
                selected={isSelected}
                onPress={() => setPreference(mode)}
              />
            );
          })}
        </View>
      </View>

      {/* Profile Details Form */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>Profile Information</Text>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
        <Field label="Bio" value={bio} onChangeText={setBio} multiline maxLength={280} />

        <Text style={[styles.fieldLabel, { color: colors.text, marginTop: space[3] }]}>Social Styles</Text>
        <View style={styles.chipsRow}>
          {STYLES.map((x) => {
            const isSelected = stylesList.includes(x.id);
            return (
              <Chip
                key={x.id}
                label={isSelected ? `✓ ${x.label}` : x.label}
                selected={isSelected}
                onPress={() =>
                  setStylesList((prev) => (prev.includes(x.id) ? prev.filter((s) => s !== x.id) : [...prev, x.id]))
                }
              />
            );
          })}
        </View>

        <Button
          label={busy ? "Saving…" : "Save profile changes"}
          onPress={() => void save()}
          disabled={busy}
          style={{ marginTop: space[4] }}
        />
      </View>

      {/* Interests Manager */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>Interests</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>{selected.length} interests selected</Text>
        <View style={styles.chipsRow}>
          {interests.map((i) => {
            const isSelected = selected.includes(i.id);
            return (
              <Chip
                key={i.id}
                label={isSelected ? `✓ ${i.name}` : i.name}
                selected={isSelected}
                onPress={() =>
                  setSelected((prev) => (prev.includes(i.id) ? prev.filter((id) => id !== i.id) : [...prev, i.id]))
                }
              />
            );
          })}
        </View>
        <Button label="Save interests" secondary compact onPress={() => void save()} disabled={busy} style={{ marginTop: space[3] }} />
      </View>

      {/* Photos Manager */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>Photos</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>Keep up to 6 profile images (max 5 MB each).</Text>

        <View style={[styles.photosGrid, { marginTop: space[3] }]}>
          {profile.media.map((m) => (
            <View
              key={m.id}
              style={[
                styles.photoItem,
                {
                  borderColor: colors.line,
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radius.md,
                },
              ]}
            >
              {mediaUrls[m.id] ? (
                <Image source={{ uri: mediaUrls[m.id] }} style={[styles.photoImg, { borderRadius: radius.md - 2 }]} />
              ) : (
                <ActivityIndicator color={colors.accent} style={styles.photoImg} />
              )}
              <Button label="Remove" danger secondary compact onPress={() => removePhoto(m.id)} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>

        {profile.media.length < 6 ? (
          <Button label="+ Add photo" secondary onPress={() => void addPhoto()} style={{ marginTop: space[3] }} />
        ) : null}
      </View>

      {/* Prompts Manager */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>Prompts</Text>
        <View style={{ gap: space[3], marginTop: space[2] }}>
          {prompts.slice(0, 6).map((p) => (
            <View key={p.id}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{p.prompt}</Text>
              <TextInput
                style={[
                  styles.textarea,
                  {
                    backgroundColor: colors.surfaceSunken,
                    borderColor: colors.lineStrong,
                    color: colors.text,
                    borderRadius: radius.sm,
                    padding: space[3],
                    marginTop: 4,
                  },
                ]}
                value={answers[p.id] ?? ""}
                onChangeText={(v) => setAnswers((a) => ({ ...a, [p.id]: v }))}
                maxLength={240}
                multiline
              />
            </View>
          ))}
        </View>
        <Button label="Save prompts" secondary compact onPress={() => void save()} disabled={busy} style={{ marginTop: space[3] }} />
      </View>

      {/* Privacy Manager */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.h2, { color: colors.text, fontSize: type.title.size }]}>Privacy</Text>
        <PrivacyEditor privacy={privacy} setPrivacy={setPrivacy} />
        <Button label="Save privacy" secondary compact onPress={() => void save()} disabled={busy} style={{ marginTop: space[3] }} />
      </View>

      {message ? <Banner tone="success">{message}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </View>
  );
}

function PrivacyEditor({
  privacy,
  setPrivacy,
}: {
  privacy: Profile["privacy"];
  setPrivacy: (v: Profile["privacy"]) => void;
}) {
  const { colors, space } = useTheme();

  return (
    <View style={{ gap: space[3], marginTop: space[2] }}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1, paddingRight: space[2] }}>
          <Text style={[styles.switchTitle, { color: colors.text }]}>Allow profile discovery</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            When turned on, you can be suggested to people in Discover.
          </Text>
        </View>
        <Switch
          value={privacy.discoverable}
          onValueChange={(v) => setPrivacy({ ...privacy, discoverable: v })}
          accessibilityLabel="Allow profile discovery"
        />
      </View>

      <Text style={[styles.fieldLabel, { color: colors.text, marginTop: space[2] }]}>Who can message me?</Text>
      <View style={styles.chipsRow}>
        {(["everyone", "connections", "nobody"] as const).map((v) => (
          <Chip
            key={v}
            label={v === "everyone" ? "Everyone" : v === "connections" ? "Connections only" : "Nobody"}
            selected={privacy.messagePermission === v}
            onPress={() => setPrivacy({ ...privacy, messagePermission: v })}
          />
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.text, marginTop: space[2] }]}>Story visibility</Text>
      <View style={styles.chipsRow}>
        {(["public", "connections", "private"] as const).map((v) => (
          <Chip
            key={v}
            label={v === "public" ? "Public" : v === "connections" ? "Connections only" : "Private"}
            selected={privacy.storyVisibility === v}
            onPress={() => setPrivacy({ ...privacy, storyVisibility: v })}
          />
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.text, marginTop: space[2] }]}>Activity visibility</Text>
      <View style={styles.chipsRow}>
        {(["public", "connections", "private"] as const).map((v) => (
          <Chip
            key={v}
            label={v === "public" ? "Public" : v === "connections" ? "Connections only" : "Private"}
            selected={privacy.activityVisibility === v}
            onPress={() => setPrivacy({ ...privacy, activityVisibility: v })}
          />
        ))}
      </View>
    </View>
  );
}

/* ==========================================================================
   Styles
   ========================================================================== */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontWeight: "700",
    marginTop: 1,
  },
  authHeader: {
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },
  h1: {
    fontWeight: "700",
    marginBottom: 6,
  },
  h2: {
    fontWeight: "700",
    marginBottom: 4,
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
  },
  authSwitch: {
    flexDirection: "row",
    marginBottom: 16,
  },
  switchBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  switchBtnActive: {
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  switchText: {
    fontSize: 14,
  },
  authFooterRow: {
    alignItems: "center",
    marginTop: 16,
  },
  linkText: {
    fontWeight: "700",
    fontSize: 14,
  },
  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    fontWeight: "700",
  },
  themeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  counter: {
    fontSize: 13,
    fontWeight: "600",
  },
  promptCard: {
    borderWidth: 1,
  },
  promptCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  radioMark: {
    fontSize: 16,
  },
  promptText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  textarea: {
    minHeight: 76,
    textAlignVertical: "top",
    fontSize: 14,
    borderWidth: 1,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoItem: {
    width: "48%",
    borderWidth: 1,
    padding: 8,
  },
  photoImg: {
    width: "100%",
    aspectRatio: 1,
  },
});
