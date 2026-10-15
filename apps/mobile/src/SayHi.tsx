import type { DiscoveryCard, StarterSet } from "@sp/types";
import type { IntroInput } from "@sp/validation";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { errorMessage } from "./auth";
import { getConnectionsClient } from "./connectionClient";
import { useTheme } from "./theme";
import { Banner, Button } from "./ui";

export function SayHi({
  card,
  onSent,
  onClose,
}: {
  card: DiscoveryCard;
  onSent: (message: string) => void;
  onClose: () => void;
}) {
  const { colors, radius, space, type } = useTheme();
  const client = getConnectionsClient();
  const [starters, setStarters] = useState<StarterSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    let alive = true;
    client
      .getStarters(card.userId)
      .then((s) => alive && setStarters(s))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [client, card.userId]);

  const send = async (intro: IntroInput) => {
    setBusy(true);
    setError(null);
    try {
      const r = await client.sendRequest(card.userId, intro);
      onSent(
        r.status === "connected"
          ? `You and ${card.displayName} are now connected!`
          : `Hi sent to ${card.displayName}. No pressure, they can reply whenever they like.`
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: space[4],
          marginTop: space[3],
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>LOW-PRESSURE OPENER</Text>
        <Text style={[styles.heading, { color: colors.text, fontSize: type.title.size }]}>
          Say hi to {card.displayName}
        </Text>
        <Text style={[styles.muted, { color: colors.textMuted, marginTop: space[1] }]}>
          Pick a starter below. They'll see it with your profile and can reply when they're ready.
        </Text>
      </View>

      {error ? <Banner tone="error">{error}</Banner> : null}

      {!starters && !error ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: space[2] }]}>
            Finding relevant openers…
          </Text>
        </View>
      ) : null}

      {starters ? (
        <View style={styles.startersWrap}>
          {starters.icebreakers.length > 0 ? (
            <View style={styles.group}>
              <Text style={[styles.groupTitle, { color: colors.text2 }]}>ABOUT WHAT YOU SHARE</Text>
              {starters.icebreakers.map((s) => (
                <Button
                  key={s.ref}
                  label={s.text}
                  disabled={busy}
                  secondary
                  compact
                  onPress={() => void send({ kind: "icebreaker", ref: s.ref })}
                  style={{ marginTop: space[2] }}
                />
              ))}
            </View>
          ) : null}

          {starters.questions.length > 0 ? (
            <View style={styles.group}>
              <Text style={[styles.groupTitle, { color: colors.text2 }]}>QUESTION CARDS</Text>
              {starters.questions.map((q) => (
                <Button
                  key={q.ref}
                  label={q.text}
                  disabled={busy}
                  secondary
                  compact
                  onPress={() => void send({ kind: "question", ref: q.ref })}
                  style={{ marginTop: space[2] }}
                />
              ))}
            </View>
          ) : null}

          {starters.games.length > 0 ? (
            <View style={styles.group}>
              <Text style={[styles.groupTitle, { color: colors.text2 }]}>THIS OR THAT — I PICK…</Text>
              {starters.games.map((g) => (
                <View key={g.ref} style={styles.gameRow}>
                  <Button
                    label={g.optionA}
                    disabled={busy}
                    secondary
                    compact
                    onPress={() => void send({ kind: "this_or_that", ref: g.ref, choice: "a" })}
                    style={{ flex: 1 }}
                  />
                  <Text style={[styles.orText, { color: colors.textMuted }]}>or</Text>
                  <Button
                    label={g.optionB}
                    disabled={busy}
                    secondary
                    compact
                    onPress={() => void send({ kind: "this_or_that", ref: g.ref, choice: "b" })}
                    style={{ flex: 1 }}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {starters.allowCustom ? (
            writing ? (
              <View style={styles.group}>
                <Text style={[styles.groupTitle, { color: colors.text2 }]}>WRITE YOUR OWN NOTE</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: colors.lineStrong,
                      backgroundColor: colors.surface,
                      color: colors.text,
                      borderRadius: radius.sm,
                      padding: space[3],
                      marginTop: space[1],
                    },
                  ]}
                  value={custom}
                  onChangeText={setCustom}
                  maxLength={240}
                  multiline
                  placeholder="A friendly, short note to introduce yourself…"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Your own short note"
                />
                <Button
                  label={busy ? "Sending…" : "Send note"}
                  disabled={busy || custom.trim().length < 2}
                  compact
                  onPress={() => void send({ kind: "custom", text: custom })}
                  style={{ marginTop: space[2] }}
                />
              </View>
            ) : (
              <Button
                label="Write my own note instead"
                secondary
                compact
                onPress={() => setWriting(true)}
                style={{ marginTop: space[2] }}
              />
            )
          ) : (
            <Text style={[styles.muted, { color: colors.textMuted, marginTop: space[2] }]}>
              {card.displayName} prefers low-pressure starters, so only these openers are available.
            </Text>
          )}
        </View>
      ) : null}

      <Button label="Cancel" secondary compact onPress={onClose} style={{ marginTop: space[3] }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
  },
  header: {
    marginBottom: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heading: {
    fontWeight: "700",
    marginTop: 2,
  },
  muted: {
    fontSize: 13,
    lineHeight: 18,
  },
  loadingWrap: {
    paddingVertical: 16,
    alignItems: "center",
  },
  startersWrap: {
    gap: 12,
  },
  group: {
    marginTop: 8,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  orText: {
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    minHeight: 68,
    textAlignVertical: "top",
    fontSize: 14,
  },
});
