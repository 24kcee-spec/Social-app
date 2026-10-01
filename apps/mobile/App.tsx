import { AuthClientError, type Me } from "@sp/auth-client";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { auth, config, errorMessage, isConfigured } from "./src/auth";

type Mode = "signin" | "signup" | "forgot";
type Phase = { kind: "loading" } | { kind: "signedOut" } | { kind: "signedIn"; me: Me } | { kind: "error"; message: string };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

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
    if (!isConfigured) return setPhase({ kind: "error", message: "Supabase is not configured. Fill SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the repo-root .env and restart Expo." });
    void load();
    return auth.onAuthChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
    });
  }, [load]);

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="auto" />
      <View style={s.card}>
        {phase.kind === "loading" && <ActivityIndicator />}
        {phase.kind === "error" && (
          <>
            <Text style={s.err} accessibilityRole="alert">{phase.message}</Text>
            {isConfigured && <Button label="Try again" onPress={() => { setPhase({ kind: "loading" }); void load(); }} />}
          </>
        )}
        {phase.kind === "signedOut" && <AuthForm />}
        {phase.kind === "signedIn" && <Account me={phase.me} />}
      </View>
    </SafeAreaView>
  );
}

function Button({ label, onPress, disabled, link }: { label: string; onPress: () => void; disabled?: boolean; link?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[link ? s.link : s.button, disabled && s.disabled]}>
      <Text style={link ? s.linkText : s.buttonText}>{label}</Text>
    </Pressable>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const switchTo = (m: Mode) => { setMode(m); setError(null); setNotice(null); setFields({}); };

  async function submit() {
    setBusy(true); setError(null); setFields({}); setNotice(null);
    try {
      if (mode === "signin") await auth.signIn({ email, password });
      else if (mode === "signup") {
        const r = await auth.signUp({ email, password, displayName: displayName.trim() || undefined });
        if (r === "confirm_email") setNotice("Check your email and tap the confirmation link, then sign in.");
      } else {
        await auth.requestPasswordReset(email, `${config.webUrl}/reset`);
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof AuthClientError) setFields(err.fieldErrors);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password";
  return (
    <>
      <Text style={s.h1}>{title}</Text>
      {mode === "signup" && (
        <>
          <Text style={s.label}>Display name (optional)</Text>
          <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} autoComplete="nickname" />
          {fields.displayName ? <Text style={s.err}>{fields.displayName}</Text> : null}
        </>
      )}
      <Text style={s.label}>Email</Text>
      <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
      {fields.email ? <Text style={s.err}>{fields.email}</Text> : null}
      {mode !== "forgot" && (
        <>
          <Text style={s.label}>Password</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          {fields.password ? <Text style={s.err}>{fields.password}</Text> : null}
        </>
      )}
      {error ? <Text style={s.err} accessibilityRole="alert">{error}</Text> : null}
      {notice ? <Text style={s.ok}>{notice}</Text> : null}
      <Button label={busy ? "Please wait..." : mode === "forgot" ? "Send reset link" : title} onPress={() => void submit()} disabled={busy} />
      <View style={s.row}>
        {mode !== "signin" && <Button link label="Sign in" onPress={() => switchTo("signin")} />}
        {mode !== "signup" && <Button link label="Create account" onPress={() => switchTo("signup")} />}
        {mode === "signin" && <Button link label="Forgot password?" onPress={() => switchTo("forgot")} />}
      </View>
    </>
  );
}

function Account({ me }: { me: Me }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Text style={s.h1}>You are signed in</Text>
      <Text style={s.body}>{me.email ?? me.phone}</Text>
      <Text style={s.muted}>Account status: {me.status}</Text>
      {error ? <Text style={s.err}>{error}</Text> : null}
      <Button label="Sign out" onPress={() => void auth.signOut().catch((e: unknown) => setError(errorMessage(e)))} />
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", backgroundColor: "#fafafa" },
  card: { margin: 16, padding: 20, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd" },
  h1: { fontSize: 22, fontWeight: "600", marginBottom: 12, color: "#1a1a1a" },
  label: { fontSize: 14, marginTop: 12, marginBottom: 4, color: "#1a1a1a" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, color: "#1a1a1a", backgroundColor: "#fff" },
  body: { fontSize: 16, color: "#1a1a1a" },
  muted: { fontSize: 14, color: "#666", marginTop: 4 },
  err: { color: "#b00020", fontSize: 14, marginTop: 6 },
  ok: { color: "#146c2e", fontSize: 15, marginTop: 8 },
  button: { marginTop: 16, backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { marginTop: 8, marginRight: 16, paddingVertical: 6 },
  linkText: { color: "#4f46e5", fontSize: 15 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  disabled: { opacity: 0.6 },
});
