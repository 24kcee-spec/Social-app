import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

export interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  style?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  value,
  onChangeText,
  secure = false,
  placeholder,
  error,
  hint,
  multiline = false,
  maxLength,
  keyboardType,
  autoCapitalize = "none",
  style,
}: FieldProps) {
  const { colors, radius, space, touch, type } = useTheme();

  return (
    <View style={[styles.field, { marginTop: space[3] }, style]}>
      <Text style={[styles.label, { fontSize: type.small.size, color: colors.text, marginBottom: space[1] }]}>
        {label}
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            minHeight: multiline ? 88 : touch.min,
            borderRadius: radius.sm,
            paddingHorizontal: space[3],
            paddingVertical: space[3],
            fontSize: type.body.size,
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.lineStrong,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint ?? undefined}
      />
      {hint && !error ? (
        <Text style={[styles.hint, { color: colors.textMuted, marginTop: space[1] }]}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text
          style={[styles.error, { color: colors.danger, fontSize: type.small.size, marginTop: space[1] }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    width: "100%",
  },
  label: {
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
  },
  hint: {
    fontSize: 12,
  },
  error: {
    fontWeight: "600",
  },
});
