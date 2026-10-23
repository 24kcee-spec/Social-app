import type { NotificationSettings } from "@sp/types";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { errorMessage } from "./auth";
import { getMessagingClient } from "./messagingClient";
import { useTheme } from "./theme";
import { Banner, Button } from "./ui";

export function NotificationSettingsScreen({ onBack }: { onBack: () => void }) {
  const { colors, radius, space, type, shadow } = useTheme();
  const client = getMessagingClient();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await client.getNotificationSettings());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updatePreference(key: keyof NotificationSettings, value: boolean) {
    if (!settings || saving !== null) return;
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaving(key);
    setError(null);
    setNotice(null);
    try {
      setSettings(await client.setNotificationSettings(next));
      setNotice("Your notification preferences are saved.");
    } catch (err) {
      setSettings(previous);
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  function preferenceRow(title: string, description: string, key: keyof NotificationSettings) {
    const value = settings?.[key] ?? false;
    const disabled = loading || saving !== null || settings === null;
    return (
      <View
        key={key}
        style={{
          minHeight: 74,
          paddingVertical: space[3],
          borderTopWidth: 1,
          borderTopColor: colors.line,
          flexDirection: "row",
          alignItems: "center",
          gap: space[3],
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>{title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>{description}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={(next) => void updatePreference(key, next)}
          disabled={disabled}
          accessibilityRole="switch"
          accessibilityLabel={title}
          accessibilityState={{ checked: value, disabled }}
          trackColor={{ false: colors.line, true: colors.accentSoft }}
          thumbColor={value ? colors.accent : colors.textMuted}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space[3] }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 11, letterSpacing: 1.2 }}>
            YOUR PREFERENCES
          </Text>
          <Text style={{ color: colors.text, fontSize: type.title.size, fontWeight: "800" }}>Notifications</Text>
          <Text style={{ color: colors.textMuted, lineHeight: 20 }}>
            Choose the notification categories Social currently supports for your account.
          </Text>
        </View>
        <Button label="Back" secondary compact onPress={onBack} />
      </View>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}

      <View
        style={[
          { padding: space[4], borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface },
          shadow[1],
        ]}
      >
        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }}>
          SUPPORTED CATEGORIES
        </Text>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 5 }}>What you hear about</Text>
        <Text style={{ color: colors.textMuted, lineHeight: 20, marginTop: 4, marginBottom: space[2] }}>
          These choices are saved to your account and can be changed at any time.
        </Text>

        {loading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[4] }}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.textMuted }}>Loading your preferences…</Text>
          </View>
        ) : settings ? (
          <>
            {preferenceRow("New messages", "Notifications related to direct messages.", "messages")}
            {preferenceRow("Connection requests", "When someone wants to connect with you.", "connectionRequests")}
          </>
        ) : (
          <View style={{ gap: space[2], marginTop: space[3] }}>
            <Text style={{ color: colors.textMuted }}>Your notification preferences could not be loaded.</Text>
            <Button label="Retry loading preferences" secondary onPress={() => void load()} disabled={loading} />
          </View>
        )}
        {saving !== null ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: space[2] }}>Saving your preference…</Text>
        ) : null}
      </View>

      <View
        style={{
          padding: space[3],
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSunken,
          gap: 5,
        }}
      >
        <Text style={{ color: colors.text, fontWeight: "800" }}>About phone alerts</Text>
        <Text style={{ color: colors.textMuted, lineHeight: 20 }}>
          Your preference choices are stored, but live push delivery is not enabled yet. These settings do not
          guarantee system notifications on your phone. The Messages area still shows your in-app unread count.
        </Text>
      </View>
    </View>
  );
}
