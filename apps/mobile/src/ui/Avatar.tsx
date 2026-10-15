import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

export interface AvatarProps {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  style?: StyleProp<ImageStyle & ViewStyle>;
  accessibilityLabel?: string;
}

const SIZES = {
  sm: { dimension: 32, fontSize: 13, radius: 16 },
  md: { dimension: 44, fontSize: 18, radius: 22 },
  lg: { dimension: 56, fontSize: 22, radius: 28 },
  xl: { dimension: 72, fontSize: 28, radius: 36 },
} as const;

export function Avatar({
  name,
  url,
  size = "md",
  style,
  accessibilityLabel,
}: AvatarProps) {
  const { colors } = useTheme();
  const cfg = SIZES[size];
  const initial = (name.trim().slice(0, 1) || "?").toUpperCase();

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? `${name}'s profile photo`}
        style={[
          {
            width: cfg.dimension,
            height: cfg.dimension,
            borderRadius: cfg.radius,
            backgroundColor: colors.surfaceSunken,
          },
          style as StyleProp<ImageStyle>,
        ]}
      />
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `${name}'s profile initials`}
      style={[
        styles.fallback,
        {
          width: cfg.dimension,
          height: cfg.dimension,
          borderRadius: cfg.radius,
          backgroundColor: colors.accentSoft,
          borderWidth: 1,
          borderColor: colors.accentLine,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.initial,
          {
            fontSize: cfg.fontSize,
            color: colors.accent,
          },
        ]}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontWeight: "800",
  },
});
