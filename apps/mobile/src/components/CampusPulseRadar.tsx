import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export function CampusPulseRadar() {
  const [checkedIn, setCheckedIn] = useState(false);
  const [activeCount, setActiveCount] = useState(142);

  const toggleCheckIn = () => {
    setCheckedIn(!checkedIn);
    setActiveCount((c) => (checkedIn ? c - 1 : c + 1));
  };

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Campus Frequency Radar</Text>
          <Text style={styles.sub}>{activeCount} students checked in right now</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={toggleCheckIn}
          style={[styles.btn, checkedIn ? styles.btnActive : styles.btnInactive]}
        >
          <Text style={[styles.btnText, checkedIn ? styles.btnTextActive : styles.btnTextInactive]}>
            {checkedIn ? 'Checked In ✓' : 'Check In'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginHorizontal: 16, marginVertical: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  sub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnInactive: { backgroundColor: '#0F172A' },
  btnActive: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  btnText: { fontSize: 11, fontWeight: '700' },
  btnTextInactive: { color: '#FFFFFF' },
  btnTextActive: { color: '#2563EB' },
});
