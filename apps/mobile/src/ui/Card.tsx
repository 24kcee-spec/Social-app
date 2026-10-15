import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

export interface CardProps {
  children: ReactNode;
  variant?: "surface" | "sunken" | "accent";
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, variant = "surface", style }: CardProps) {
  const { colors, radius, space, shadow } = useTheme();

  let bg = colors.surface;
  let borderColor = colors.line;

  if (variant === "sunken") {
    bg = colors.surfaceSunken;
    borderColor = colors.line;
  } else if (variant === "accent") {
    bg = colors.accentSoft;
    borderColor = colors.accentLine;
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor,
          borderRadius: radius.md,
          padding: space[4],
          marginTop: space[3],
        },
        shadow[1],
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: "hidden",
  },
});
