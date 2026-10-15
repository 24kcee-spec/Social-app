import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

export type BannerTone = "error" | "success" | "info" | "warning";

export function Banner({
  tone,
  children,
  style,
}: {
  tone: BannerTone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, space, type } = useTheme();

  const palette = {
    error: { bg: colors.dangerSoft, fg: colors.danger, mark: "!" },
    success: { bg: colors.successSoft, fg: colors.success, mark: "✓" },
    info: { bg: colors.accentSoft, fg: colors.accent, mark: "i" },
    warning: { bg: colors.warningSoft, fg: colors.warning, mark: "⚠" },
  } as const;

  const p = palette[tone];

  return (
    <View
      accessible
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"}
      style={[
        styles.box,
        {
          backgroundColor: p.bg,
          padding: space[3],
          borderRadius: radius.sm,
          marginTop: space[3],
          borderColor: p.fg,
          borderLeftWidth: 3,
        },
        style,
      ]}
    >
      <Text style={[styles.mark, { color: p.fg, fontSize: type.small.size }]} importantForAccessibility="no">
        {p.mark}
      </Text>
      <Text style={[styles.text, { color: p.fg, fontSize: type.small.size, lineHeight: type.small.line }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  mark: {
    fontWeight: "800",
    width: 18,
    textAlign: "center",
  },
  text: {
    flex: 1,
    fontWeight: "600",
  },
});
