import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

export interface ChipProps {
  label: string;
  selected?: boolean;
  accent?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  selected = false,
  accent = false,
  onPress,
  disabled = false,
  style,
}: ChipProps) {
  const { colors, radius, space, type } = useTheme();

  const isHighlighted = selected || accent;
  const isInteractive = Boolean(onPress);

  return (
    <Pressable
      accessibilityRole={isInteractive ? "checkbox" : undefined}
      accessibilityState={isInteractive ? { checked: selected, disabled } : undefined}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || !isInteractive}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radius.pill,
          paddingHorizontal: space[3],
          paddingVertical: space[2] - 1,
          backgroundColor: isHighlighted ? colors.accentSoft : colors.surfaceSunken,
          borderColor: isHighlighted ? colors.accentLine : colors.line,
          borderWidth: 1,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: isHighlighted ? colors.accent : colors.text2,
            fontWeight: isHighlighted ? "700" : "500",
            fontSize: type.small.size,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    letterSpacing: 0.1,
  },
});
