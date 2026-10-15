import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  danger?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  disabled,
  busy,
  secondary,
  danger,
  compact,
  style,
}: ButtonProps) {
  const { colors, radius, space, touch, type } = useTheme();
  const inactive = disabled || busy;

  let bg = colors.accent;
  let fg = colors.onAccent;
  let borderColor: string | undefined = undefined;

  if (danger) {
    if (secondary) {
      bg = colors.surface;
      fg = colors.danger;
      borderColor = colors.lineStrong;
    } else {
      bg = colors.danger;
      fg = "#FFFFFF";
    }
  } else if (secondary) {
    bg = colors.surface;
    fg = colors.accent;
    borderColor = colors.lineStrong;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={onPress}
      disabled={inactive}
      hitSlop={compact ? 8 : 4}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: compact ? 36 : touch.min,
          paddingHorizontal: compact ? space[3] : space[4],
          paddingVertical: compact ? space[2] : space[3],
          borderRadius: radius.sm,
          backgroundColor: bg,
          borderWidth: borderColor ? 1 : 0,
          borderColor,
        },
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} size={compact ? "small" : "small"} />
      ) : (
        <Text
          style={[
            styles.text,
            {
              color: fg,
              fontSize: compact ? type.small.size : type.body.size,
              fontWeight: "700",
            },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  inactive: {
    opacity: 0.55,
  },
  text: {
    textAlign: "center",
  },
});
