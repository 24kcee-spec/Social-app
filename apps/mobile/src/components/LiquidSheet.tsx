import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, radius, space, touch, type } from '../theme';

export interface LiquidSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Bottom sheet on a native Modal: Android back button closes it (onRequestClose),
 * content scrolls when tall, the keyboard pushes the sheet up, iOS safe area is respected.
 */
export function LiquidSheet({ visible, title, onClose, children }: LiquidSheetProps) {
  const { height } = useWindowDimensions();
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.backdrop} onPress={onClose} />
        <SafeAreaView accessibilityViewIsModal style={[styles.sheet, { maxHeight: height * 0.85 }]}>
          <View style={styles.grabHandle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>{'\u2715'}</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>{children}</ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1, borderColor: colors.line, paddingHorizontal: space[5], paddingTop: space[3] },
  grabHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, alignSelf: 'center', marginBottom: space[3] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[3] },
  title: { flex: 1, color: colors.text, fontSize: type.title.size, lineHeight: type.title.line, fontWeight: '700' },
  closeBtn: { width: touch.min, height: touch.min, borderRadius: touch.min / 2, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: colors.text2, fontSize: type.small.size, fontWeight: '700' },
  body: { paddingBottom: space[6] },
});
