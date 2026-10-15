import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';

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
  const { colors, radius, space, touch, type } = useTheme();
  const { height } = useWindowDimensions();

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={[styles.overlay, { backgroundColor: colors.overlay }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.backdrop} onPress={onClose} />
        <SafeAreaView
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              borderRadius: radius.lg,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              paddingHorizontal: space[5],
              paddingTop: space[3],
              maxHeight: height * 0.85,
            },
          ]}
        >
          <View style={[styles.grabHandle, { backgroundColor: colors.lineStrong }]} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text, fontSize: type.title.size, lineHeight: type.title.line }]}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={[styles.closeBtn, { width: touch.min, height: touch.min, borderRadius: touch.min / 2, backgroundColor: colors.surfaceSunken }]}
            >
              <Text style={[styles.closeBtnText, { color: colors.text2, fontSize: type.small.size }]}>{'\u2715'}</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: space[6] }]}>
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { borderTopWidth: 1 },
  grabHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { flex: 1, fontWeight: '700' },
  closeBtn: { alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontWeight: '700' },
  body: {},
});
