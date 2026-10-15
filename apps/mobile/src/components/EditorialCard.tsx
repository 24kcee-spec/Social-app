import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

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
  const { colors, radius, space, type, shadow } = useTheme();
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
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderRadius: radius.lg,
          padding: space[4],
        },
        shadow[1],
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.nameLockup}>
          <Text style={[styles.nameText, { color: colors.text, fontSize: type.title.size }]}>{profile.name}</Text>
          <View
            style={[
              styles.verifiedCrest,
              {
                backgroundColor: colors.accentSoft,
                borderColor: colors.accentLine,
                borderRadius: radius.sm - 2,
              },
            ]}
          >
            <Text style={[styles.verifiedCheck, { color: colors.accent }]}>✓</Text>
            <Text style={[styles.verifiedLabel, { color: colors.accent }]}>CAMPUS VERIFIED</Text>
          </View>
        </View>
        {profile.mutualCount ? (
          <Text style={[styles.mutualBadge, { color: colors.textMuted, fontSize: type.caption.size }]}>
            {profile.mutualCount} mutuals
          </Text>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: colors.textMuted, fontSize: type.caption.size }]}>
          {profile.faculty} '{profile.gradYear}
        </Text>
        <Text style={[styles.metaDot, { color: colors.lineStrong }]}>·</Text>
        <Text style={[styles.metaText, { color: colors.textMuted, fontSize: type.caption.size }]}>
          {profile.campus}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View photos of ${profile.name}`}
        onPress={handlePhotoPress}
        style={[styles.photoContainer, { backgroundColor: colors.surfaceSunken, borderRadius: radius.md }]}
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
          <View style={[styles.heartBurst, { backgroundColor: colors.surface }]}>
            <Text style={styles.heartEmoji}>⚡</Text>
          </View>
        )}
      </Pressable>

      {profile.promptQuestion && profile.promptAnswer && (
        <View
          style={[
            styles.promptCard,
            {
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.line,
              borderRadius: radius.sm,
              padding: space[3],
            },
          ]}
        >
          <Text style={[styles.promptQuestion, { color: colors.textMuted, fontSize: type.caption.size }]}>
            Q: {profile.promptQuestion}
          </Text>
          <Text style={[styles.promptAnswer, { color: colors.text, fontSize: type.body.size }]}>
            {profile.promptAnswer}
          </Text>
        </View>
      )}

      <View style={styles.interestsRow}>
        {profile.interests.map((interest, i) => (
          <View
            key={i}
            style={[
              styles.interestTag,
              {
                backgroundColor: colors.surfaceSunken,
                borderColor: colors.line,
                borderRadius: radius.sm,
              },
            ]}
          >
            <Text style={[styles.interestText, { color: colors.text2, fontSize: type.caption.size }]}>
              {interest}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.actionRow, { borderTopColor: colors.line }]}>
        <Pressable
          accessibilityRole="button"
          onPress={handleSpark}
          disabled={sparkSent}
          style={[
            styles.sparkButton,
            {
              backgroundColor: sparkSent ? colors.surfaceSunken : colors.accent,
              borderRadius: radius.sm,
            },
          ]}
        >
          <Text
            style={[
              styles.sparkButtonText,
              { color: sparkSent ? colors.textMuted : colors.onAccent },
            ]}
          >
            {sparkSent ? 'Spark Sent ⚡' : 'Spark Connection ⚡'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    marginVertical: 10,
    marginHorizontal: 16,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  nameLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameText: { fontWeight: '800', letterSpacing: -0.3 },
  verifiedCrest: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  verifiedCheck: { fontSize: 10, fontWeight: '900' },
  verifiedLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  mutualBadge: { fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6 },
  metaText: { fontWeight: '500' },
  metaDot: {},
  photoContainer: {
    height: 280,
    overflow: 'hidden',
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
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  photoHeadline: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', fontStyle: 'italic' },
  heartBurst: {
    position: 'absolute',
    top: '40%',
    left: '42%',
    borderRadius: 30,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  heartEmoji: { fontSize: 32 },
  promptCard: {
    borderWidth: 1,
    marginBottom: 12,
  },
  promptQuestion: { fontWeight: '700', marginBottom: 4 },
  promptAnswer: { fontWeight: '600', lineHeight: 18 },
  interestsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  interestTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  interestText: { fontWeight: '600' },
  actionRow: { borderTopWidth: 1, paddingTop: 12 },
  sparkButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkButtonText: { fontSize: 13, fontWeight: '700' },
});
