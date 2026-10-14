import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space, type } from "../theme";

type Tone = "error" | "success" | "info";
const palette = { error: { bg: colors.dangerSoft, fg: colors.danger, mark: "!" }, success: { bg: colors.successSoft, fg: colors.success, mark: "✓" }, info: { bg: colors.accentSoft, fg: colors.accent, mark: "i" } } as const;

/** Status message. Icon + text, so status never relies on colour alone. */
export function Banner({ tone, children }: { tone: Tone; children: ReactNode }) {
  const p = palette[tone];
  return (
    <View
      accessible
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"}
      style={[styles.box, { backgroundColor: p.bg }]}
    >
      <Text style={[styles.mark, { color: p.fg }]} importantForAccessibility="no">{p.mark}</Text>
      <Text style={[styles.text, { color: p.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: space[2], padding: space[3], borderRadius: radius.sm, marginTop: space[3] },
  mark: { fontSize: type.small.size, fontWeight: "800", width: 16, textAlign: "center" },
  text: { flex: 1, fontSize: type.small.size, lineHeight: type.small.line, fontWeight: "600" },
});
