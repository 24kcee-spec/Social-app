import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';

export interface StudentProfileData {
  id: string;
  name: string;
  faculty: string;
  gradYear: string;
  campus: string;
  avatarUrl: string;
  lifestylePhotoUrl: string;
  bioHeadline: string;
  promptQuestion?: string;
  promptAnswer?: string;
  mutualCount?: number;
  interests: string[];
}

export interface EditorialCardProps {
  profile: StudentProfileData;
  onSparkPress?: (profile: StudentProfileData) => void;
  onDoubleTapHeart?: (profile: StudentProfileData) => void;
}

export function EditorialCard({ profile, onSparkPress, onDoubleTapHeart }: EditorialCardProps) {
  const [sparkSent, setSparkSent] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [lastTap, setLastTap] = useState(0);

  const handlePhotoPress = () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      setShowHeartBurst(true);
      onDoubleTapHeart?.(profile);
      setTimeout(() => setShowHeartBurst(false), 900);
    }
    setLastTap(now);
  };

  const handleSpark = () => {
    setSparkSent(true);
    onSparkPress?.(profile);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.nameLockup}>
          <Text style={styles.nameText}>{profile.name}</Text>
          <View style={styles.verifiedCrest}>
            <Text style={styles.verifiedCheck}>âœ“</Text>
            <Text style={styles.verifiedLabel}>CAMPUS VERIFIED</Text>
          </View>
        </View>
        {profile.mutualCount ? <Text style={styles.mutualBadge}>{profile.mutualCount} mutuals</Text> : null}
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{profile.faculty} '{profile.gradYear}</Text>
        <Text style={styles.metaDot}>Â·</Text>
        <Text style={styles.metaText}>{profile.campus}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View photos of ${profile.name}`}
        onPress={handlePhotoPress}
        style={styles.photoContainer}
      >
        <Image
          source={{ uri: profile.lifestylePhotoUrl || profile.avatarUrl }}
          style={styles.photo}
          resizeMode="cover"
        />
        <View style={styles.photoScrim}>
          <Text style={styles.photoHeadline} numberOfLines={2}>
            "{profile.bioHeadline}"
          </Text>
        </View>
        {showHeartBurst && (
          <View style={styles.heartBurst}>
            <Text style={styles.heartEmoji}>âš¡</Text>
          </View>
        )}
      </Pressable>

      {profile.promptQuestion && profile.promptAnswer && (
        <View style={styles.promptCard}>
          <Text style={styles.promptQuestion}>Q: {profile.promptQuestion}</Text>
          <Text style={styles.promptAnswer}>{profile.promptAnswer}</Text>
        </View>
      )}

      <View style={styles.interestsRow}>
        {profile.interests.map((interest, i) => (
          <View key={i} style={styles.interestTag}>
            <Text style={styles.interestText}>{interest}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={handleSpark}
          disabled={sparkSent}
          style={[styles.sparkButton, sparkSent && styles.sparkButtonSent]}
        >
          <Text style={[styles.sparkButtonText, sparkSent && styles.sparkButtonTextSent]}>
            {sparkSent ? 'Spark Sent âš¡' : 'Spark Connection âš¡'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginVertical: 10,
    marginHorizontal: 16,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  nameLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameText: { color: '#0F172A', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  verifiedCrest: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  verifiedCheck: { color: '#2563EB', fontSize: 10, fontWeight: '900' },
  verifiedLabel: { color: '#1D4ED8', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  mutualBadge: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6 },
  metaText: { color: '#64748B', fontSize: 12, fontWeight: '500' },
  metaDot: { color: '#94A3B8' },
  photoContainer: {
    height: 280,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    position: 'relative',
    marginBottom: 12,
  },
  photo: { width: '100%', height: '100%' },
  photoScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  photoHeadline: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', fontStyle: 'italic' },
  heartBurst: {
    position: 'absolute',
    top: '40%',
    left: '42%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 30,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartEmoji: { fontSize: 32 },
  promptCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  promptQuestion: { color: '#64748B', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  promptAnswer: { color: '#0F172A', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  interestsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  interestTag: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  interestText: { color: '#334155', fontSize: 11, fontWeight: '600' },
  actionRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 },
  sparkButton: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkButtonSent: { backgroundColor: '#F1F5F9' },
  sparkButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  sparkButtonTextSent: { color: '#64748B' },
});
