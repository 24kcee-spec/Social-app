import type { ReportReason, ReportTargetType } from "@sp/types";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { errorMessage } from "../auth";
import { getSafetyClient } from "../safetyClient";
import { useTheme } from "../theme";
import { Banner } from "./Banner";
import { Button } from "./Button";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "spam", label: "Spam or automated messages" },
  { value: "inappropriate_content", label: "Inappropriate or explicit content" },
  { value: "hate_speech", label: "Hate speech or discrimination" },
  { value: "impersonation", label: "Impersonation or fake account" },
  { value: "safety_concern", label: "Immediate safety concern" },
  { value: "other", label: "Other issue" },
];

export interface ReportSheetProps {
  visible: boolean;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReportSheet({
  visible,
  targetType,
  targetId,
  targetLabel,
  onClose,
  onSuccess,
}: ReportSheetProps) {
  const { colors, radius, space, type } = useTheme();
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [blockUser, setBlockUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason("harassment");
    setDetails("");
    setBlockUser(true);
    setBusy(false);
    setDone(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const client = getSafetyClient();
      await client.report({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
        blockUser,
      });
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const canBlock = targetType === "profile" || targetType === "message" || targetType === "event_message";

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              borderRadius: radius.lg,
              padding: space[4],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>SAFETY REPORT</Text>
              <Text style={[styles.title, { color: colors.text, fontSize: type.title.size }]}>
                Report {targetLabel ?? targetType}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close report dialog"
              onPress={handleClose}
              hitSlop={8}
              style={styles.closeBtn}
            >
              <Text style={[styles.closeText, { color: colors.textMuted }]}>✕</Text>
            </Pressable>
          </View>

          {done ? (
            <View style={{ marginTop: space[3] }}>
              <Banner tone="success">
                Thank you for letting us know. Our safety moderators have received your report.
              </Banner>
              {blockUser && canBlock ? (
                <Text style={[styles.muted, { color: colors.textMuted, marginTop: space[2] }]}>
                  This user has also been blocked from your feed and messages.
                </Text>
              ) : null}
              <Button label="Done" onPress={handleClose} style={{ marginTop: space[4] }} />
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: space[3] }}>
              {error ? <Banner tone="error">{error}</Banner> : null}

              <Text style={[styles.sectionTitle, { color: colors.text2, marginTop: space[3] }]}>
                Why are you reporting this?
              </Text>
              <View style={styles.reasonList}>
                {REASONS.map((r) => {
                  const isSelected = reason === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={r.label}
                      onPress={() => setReason(r.value)}
                      style={[
                        styles.reasonRow,
                        {
                          borderColor: isSelected ? colors.accentLine : colors.line,
                          backgroundColor: isSelected ? colors.accentSoft : colors.surfaceSunken,
                          borderRadius: radius.sm,
                          padding: space[3],
                        },
                      ]}
                    >
                      <Text style={[styles.radioMark, { color: isSelected ? colors.accent : colors.textMuted }]}>
                        {isSelected ? "◉" : "○"}
                      </Text>
                      <Text
                        style={[
                          styles.reasonLabel,
                          {
                            color: isSelected ? colors.accent : colors.text,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {r.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.sectionTitle, { color: colors.text2, marginTop: space[3] }]}>
                Additional details (optional)
              </Text>
              <TextInput
                style={[
                  styles.textarea,
                  {
                    borderColor: colors.lineStrong,
                    backgroundColor: colors.surfaceSunken,
                    color: colors.text,
                    borderRadius: radius.sm,
                    padding: space[3],
                  },
                ]}
                value={details}
                onChangeText={setDetails}
                maxLength={1000}
                multiline
                numberOfLines={3}
                placeholder="Give us context to help our moderation team investigate…"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Additional details"
              />

              {canBlock ? (
                <View
                  style={[
                    styles.blockRow,
                    {
                      borderColor: colors.line,
                      backgroundColor: colors.surfaceSunken,
                      borderRadius: radius.sm,
                      padding: space[3],
                      marginTop: space[3],
                    },
                  ]}
                >
                  <View style={{ flex: 1, marginRight: space[2] }}>
                    <Text style={[styles.blockTitle, { color: colors.text }]}>Block this person</Text>
                    <Text style={[styles.blockDesc, { color: colors.textMuted }]}>
                      They won't be able to see your profile or contact you.
                    </Text>
                  </View>
                  <Switch
                    value={blockUser}
                    onValueChange={setBlockUser}
                    accessibilityLabel="Block this person"
                  />
                </View>
              ) : null}

              <View style={[styles.actions, { marginTop: space[4] }]}>
                <Button label="Cancel" secondary compact onPress={handleClose} disabled={busy} />
                <Button
                  label={busy ? "Submitting…" : "Submit report"}
                  danger
                  compact
                  onPress={() => void submit()}
                  disabled={busy}
                />
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    fontWeight: "700",
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 20,
    fontWeight: "700",
  },
  scroll: {
    maxHeight: 520,
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  reasonList: {
    gap: 6,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    gap: 10,
  },
  radioMark: {
    fontSize: 16,
  },
  reasonLabel: {
    fontSize: 14,
    flex: 1,
  },
  textarea: {
    borderWidth: 1,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: 14,
  },
  blockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  blockDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
});
