import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

export interface BadgeProps {
  label?: string | number;
  count?: number;
  tone?: "accent" | "neutral" | "success" | "danger" | "warning";
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Badge({
  label,
  count,
  tone = "accent",
  compact,
  style,
}: BadgeProps) {
  const { colors, radius, space, type } = useTheme();

  const displayText = count !== undefined ? (count > 99 ? "99+" : String(count)) : label;
  if (displayText === undefined || displayText === "") return null;

  let bg = colors.accentSoft;
  let fg = colors.accent;
  let borderColor = colors.accentLine;

  if (tone === "neutral") {
    bg = colors.surfaceSunken;
    fg = colors.text2;
    borderColor = colors.line;
  } else if (tone === "success") {
    bg = colors.successSoft;
    fg = colors.success;
    borderColor = colors.success;
  } else if (tone === "danger") {
    bg = colors.dangerSoft;
    fg = colors.danger;
    borderColor = colors.danger;
  } else if (tone === "warning") {
    bg = colors.warningSoft;
    fg = colors.warning;
    borderColor = colors.warning;
  }

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderColor,
          borderRadius: radius.pill,
          paddingHorizontal: compact ? space[1] + 2 : space[2] + 2,
          paddingVertical: compact ? 1 : space[1],
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: fg,
            fontSize: compact ? 11 : type.caption.size,
          },
        ]}
      >
        {displayText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontWeight: "700",
  },
});
