import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description: string;
  mark?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  title,
  description,
  mark = "✦",
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const { colors, radius, space, type } = useTheme();

  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: space[5],
          marginTop: space[3],
        },
        style,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: colors.accentSoft,
            borderColor: colors.accentLine,
            width: 44,
            height: 44,
            borderRadius: 22,
            marginBottom: space[3],
          },
        ]}
      >
        <Text style={[styles.mark, { color: colors.accent }]}>{mark}</Text>
      </View>
      <Text style={[styles.title, { color: colors.text, fontSize: type.title.size }]}>
        {title}
      </Text>
      <Text style={[styles.desc, { color: colors.textMuted, fontSize: type.small.size, marginTop: space[1] }]}>
        {description}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} secondary compact style={{ marginTop: space[4] }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  },
  iconWrap: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    fontSize: 20,
    fontWeight: "700",
  },
  title: {
    fontWeight: "700",
    textAlign: "center",
  },
  desc: {
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 20,
  },
});
