import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, space, touch, type } from "../theme";

type Props = { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean };

export function Button({ label, onPress, disabled, busy, secondary }: Props) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={onPress}
      disabled={inactive}
      hitSlop={4}
      style={({ pressed }) => [styles.base, secondary ? styles.secondary : styles.primary, pressed && styles.pressed, inactive && styles.inactive]}
    >
      {busy ? <ActivityIndicator color={secondary ? colors.accent : colors.onAccent} /> : <Text style={[styles.text, secondary && styles.secondaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: touch.min, borderRadius: radius.sm, paddingHorizontal: space[4], paddingVertical: space[3], alignItems: "center", justifyContent: "center", marginTop: space[3] },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.55 },
  text: { color: colors.onAccent, fontSize: type.body.size, fontWeight: "700" },
  secondaryText: { color: colors.accent },
});
