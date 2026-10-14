import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, space, touch, type } from "../theme";

type Props = { label: string; value: string; onChangeText: (v: string) => void; secure?: boolean; placeholder?: string; error?: string | null };

export function Field({ label, value, onChangeText, secure = false, placeholder, error }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !!error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        accessibilityLabel={label}
        accessibilityHint={error ?? undefined}
      />
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: space[3] },
  label: { fontSize: type.small.size, fontWeight: "600", color: colors.text, marginBottom: space[1] },
  input: { minHeight: touch.min, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[3], fontSize: type.body.size, color: colors.text, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: type.small.size, marginTop: space[1] },
});
