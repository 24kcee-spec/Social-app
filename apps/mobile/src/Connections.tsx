import type { ConnectionRequestView, ConnectionView, PersonSummary } from '@sp/types';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from './auth';
import { getConnectionsClient } from './connectionClient';
import { getSignedMediaUrl } from './profile';
import { useTheme } from './theme';
import { Avatar, Badge, Banner, Button, EmptyState, ReportSheet } from './ui';

const STATUS_TEXT = {
  pending: 'Waiting. They can reply anytime in the next two weeks.',
  accepted: 'Connected',
  no_reply: 'No reply yet. That is okay, people reply on their own time.',
} as const;

export function Connections({
  onCount,
  onMessage,
}: {
  onCount?: (pending: number) => void;
  onMessage?: (userId: string) => void;
}) {
  const { colors, radius, space, type, shadow } = useTheme();
  const client = getConnectionsClient();

  const [incoming, setIncoming] = useState<ConnectionRequestView[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequestView[]>([]);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportingUser, setReportingUser] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inc, out, con] = await Promise.all([
        client.listRequests('incoming'),
        client.listRequests('outgoing'),
        client.listConnections(),
      ]);
      setIncoming(inc);
      setOutgoing(out);
      setConnections(con);
      onCount?.(inc.length);

      const people = [
        ...inc.map((r) => r.other),
        ...out.map((r) => r.other),
        ...con.map((x) => x.other),
      ].filter((p) => p.thumbnailPath);
      const pairs = await Promise.all(
        people.map(async (p) => {
          try {
            return [p.userId, await getSignedMediaUrl(p.thumbnailPath!)] as const;
          } catch {
            return null;
          }
        }),
      );
      setPhotos(
        Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setError(null);
    try {
      await fn();
      setNotice(message);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = (x: ConnectionView) =>
    Alert.alert(
      `Remove ${x.other.displayName}?`,
      'They will be removed from your connections list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            void act(() => client.removeConnection(x.other.userId), 'Connection removed.'),
        },
      ],
    );

  return (
    <View style={styles.container}>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: space[3] }]}>
            Loading your connections…
          </Text>
        </View>
      ) : (
        <>
          {/* Incoming connection requests */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text
                style={[styles.sectionTitle, { color: colors.text, fontSize: type.title.size }]}
              >
                Said hi to you
              </Text>
              {incoming.length > 0 ? <Badge count={incoming.length} tone="accent" /> : null}
            </View>

            {incoming.length === 0 ? (
              <EmptyState
                title="Nothing waiting"
                description="When someone says hi from Discover, it shows up here. You can reply whenever you're ready, without pressure."
                mark="✉"
              />
            ) : (
              incoming.map((r) => (
                <View
                  key={r.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.line,
                      borderRadius: radius.md,
                      padding: space[4],
                      marginTop: space[3],
                    },
                    shadow[1],
                  ]}
                >
                  <View style={styles.personHeader}>
                    <Avatar name={r.other.displayName} url={photos[r.other.userId]} size="md" />
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Text
                          style={[
                            styles.name,
                            { color: colors.text, fontSize: type.bodyStrong.size },
                          ]}
                        >
                          {r.other.displayName}
                        </Text>
                        {r.other.verificationLevel === 'student_verified' ? (
                          <Badge label="✓ Campus Verified" tone="success" compact />
                        ) : r.other.verificationLevel === 'trusted' ? (
                          <Badge label="✓ Verified" tone="accent" compact />
                        ) : null}
                      </View>
                      {r.other.bio ? (
                        <Text
                          style={[
                            styles.muted,
                            { color: colors.textMuted, fontSize: type.small.size },
                          ]}
                          numberOfLines={2}
                        >
                          {r.other.bio}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Report ${r.other.displayName}`}
                      onPress={() =>
                        setReportingUser({ id: r.other.userId, name: r.other.displayName })
                      }
                      hitSlop={8}
                    >
                      <Text style={[styles.flagText, { color: colors.textMuted }]}>⚑</Text>
                    </Pressable>
                  </View>

                  <View
                    style={[
                      styles.introBox,
                      {
                        backgroundColor: colors.accentSoft,
                        borderLeftColor: colors.accent,
                        borderRadius: radius.sm,
                        padding: space[3],
                        marginTop: space[3],
                      },
                    ]}
                  >
                    <Text
                      style={[styles.introText, { color: colors.text, fontSize: type.body.size }]}
                    >
                      "{r.intro.text}"
                    </Text>
                  </View>

                  <View style={[styles.actionsRow, { marginTop: space[3] }]}>
                    <Button
                      label="Connect"
                      compact
                      onPress={() =>
                        void act(
                          () => client.accept(r.id),
                          `You are now connected with ${r.other.displayName}!`,
                        )
                      }
                    />
                    <Button
                      label="Not now"
                      secondary
                      compact
                      onPress={() =>
                        void act(
                          () => client.decline(r.id),
                          'Done. They will not be notified of your decision.',
                        )
                      }
                    />
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Active connections */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text
                style={[styles.sectionTitle, { color: colors.text, fontSize: type.title.size }]}
              >
                Your connections
              </Text>
              {connections.length > 0 ? <Badge count={connections.length} tone="neutral" /> : null}
            </View>

            {connections.length === 0 ? (
              <EmptyState
                title="No connections yet"
                description="Explore Discover to find people with shared interests and values. Send an opener to start a calm conversation."
                mark="⚯"
              />
            ) : (
              connections.map((x) => (
                <View
                  key={x.other.userId}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.line,
                      borderRadius: radius.md,
                      padding: space[4],
                      marginTop: space[3],
                    },
                    shadow[1],
                  ]}
                >
                  <View style={styles.personHeader}>
                    <Avatar name={x.other.displayName} url={photos[x.other.userId]} size="md" />
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Text
                          style={[
                            styles.name,
                            { color: colors.text, fontSize: type.bodyStrong.size },
                          ]}
                        >
                          {x.other.displayName}
                        </Text>
                        {x.other.verificationLevel === 'student_verified' ? (
                          <Badge label="✓ Campus Verified" tone="success" compact />
                        ) : x.other.verificationLevel === 'trusted' ? (
                          <Badge label="✓ Verified" tone="accent" compact />
                        ) : null}
                      </View>
                      {x.other.bio ? (
                        <Text
                          style={[
                            styles.muted,
                            { color: colors.textMuted, fontSize: type.small.size },
                          ]}
                          numberOfLines={1}
                        >
                          {x.other.bio}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={[styles.actionsRow, { marginTop: space[3] }]}>
                    {onMessage ? (
                      <Button label="Message" compact onPress={() => onMessage(x.other.userId)} />
                    ) : null}
                    <Button label="Remove" danger secondary compact onPress={() => remove(x)} />
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Outgoing sent hellos */}
          {outgoing.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text
                  style={[styles.sectionTitle, { color: colors.text, fontSize: type.title.size }]}
                >
                  Your hellos
                </Text>
                <Badge count={outgoing.length} tone="neutral" />
              </View>

              {outgoing.map((r) => (
                <View
                  key={r.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.line,
                      borderRadius: radius.md,
                      padding: space[4],
                      marginTop: space[3],
                    },
                    shadow[1],
                  ]}
                >
                  <View style={styles.personHeader}>
                    <Avatar name={r.other.displayName} url={photos[r.other.userId]} size="md" />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.name,
                          { color: colors.text, fontSize: type.bodyStrong.size },
                        ]}
                      >
                        {r.other.displayName}
                      </Text>
                      <Text
                        style={[
                          styles.muted,
                          { color: colors.textMuted, fontSize: type.caption.size },
                        ]}
                      >
                        {STATUS_TEXT[r.status]}
                      </Text>
                    </View>
                    <Badge
                      label={
                        r.status === 'pending'
                          ? 'Pending'
                          : r.status === 'accepted'
                            ? 'Accepted'
                            : 'No reply'
                      }
                      tone={r.status === 'accepted' ? 'success' : 'neutral'}
                      compact
                    />
                  </View>

                  <View
                    style={[
                      styles.introBox,
                      {
                        backgroundColor: colors.surfaceSunken,
                        borderLeftColor: colors.lineStrong,
                        borderRadius: radius.sm,
                        padding: space[3],
                        marginTop: space[3],
                      },
                    ]}
                  >
                    <Text
                      style={[styles.introText, { color: colors.text2, fontSize: type.small.size }]}
                    >
                      "{r.intro.text}"
                    </Text>
                  </View>

                  {r.status === 'pending' ? (
                    <View style={[styles.actionsRow, { marginTop: space[3] }]}>
                      <Button
                        label="Withdraw hello"
                        secondary
                        compact
                        onPress={() => void act(() => client.withdraw(r.id), 'Hello withdrawn.')}
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}

      {/* Safety reporting modal */}
      {reportingUser ? (
        <ReportSheet
          visible={Boolean(reportingUser)}
          targetType="profile"
          targetId={reportingUser.id}
          targetLabel={reportingUser.name}
          onClose={() => setReportingUser(null)}
          onSuccess={() => {
            setNotice(`Report for ${reportingUser.name} submitted. Thank you.`);
            void load();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  card: {
    borderWidth: 1,
  },
  cardTitle: {
    fontWeight: '700',
  },
  lowPressureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  muted: {
    lineHeight: 18,
  },
  loaderWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  section: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  personHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: {
    fontWeight: '700',
  },
  flagText: {
    fontSize: 16,
    padding: 6,
  },
  introBox: {
    borderLeftWidth: 3,
  },
  introText: {
    fontWeight: '500',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
});
