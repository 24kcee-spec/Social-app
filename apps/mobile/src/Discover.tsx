import type { BlockedUser, DiscoveryCard, SocialStyle } from "@sp/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { errorMessage } from "./auth";
import { getDiscoveryClient } from "./discovery";
import { getSignedMediaUrl } from "./profile";
import { SayHi } from "./SayHi";
import { useTheme } from "./theme";
import { Avatar, Badge, Banner, Button, Chip, EmptyState, ReportSheet } from "./ui";

const STYLE_LABELS: Record<SocialStyle, string> = {
  small_group: "Small groups",
  one_to_one: "One-to-one",
  text_first: "Text-first",
  voice_first: "Voice-first",
  low_pressure: "Low pressure",
};

const PAGE = 12;

export function Discover() {
  const { colors, radius, space, type, shadow } = useTheme();
  const client = getDiscoveryClient();

  const [people, setPeople] = useState<DiscoveryCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [reportingUser, setReportingUser] = useState<{ id: string; name: string } | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const loadPhotos = useCallback(async (cards: DiscoveryCard[]) => {
    const pairs = await Promise.all(
      cards
        .filter((c) => c.thumbnailPath)
        .map(async (c) => {
          try {
            return [c.userId, await getSignedMediaUrl(c.thumbnailPath!)] as const;
          } catch {
            return null;
          }
        })
    );
    setPhotos((cur) => ({
      ...cur,
      ...Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)),
    }));
  }, []);

  const track = useCallback(
    (cards: DiscoveryCard[]) => {
      const fresh = cards.filter((c) => !seen.current.has(c.userId));
      fresh.forEach((c) => seen.current.add(c.userId));
      if (fresh.length) {
        void client
          .recordEvents(fresh.map((c) => ({ candidateId: c.userId, type: "impression" as const })))
          .catch(() => undefined);
      }
    },
    [client]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const feed = await client.getPeople(PAGE, 0);
      setPeople(feed.people);
      setHasMore(feed.hasMore);
      track(feed.people);
      void loadPhotos(feed.people);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client, loadPhotos, track]);

  useEffect(() => {
    void load();
  }, [load]);

  const more = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const feed = await client.getPeople(PAGE, people.length);
      const known = new Set(people.map((p) => p.userId));
      const added = feed.people.filter((p) => !known.has(p.userId));
      setPeople([...people, ...added]);
      setHasMore(feed.hasMore);
      track(added);
      void loadPhotos(added);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = (card: DiscoveryCard) => {
    const next = open === card.userId ? null : card.userId;
    setOpen(next);
    if (next) {
      void client.recordEvents([{ candidateId: card.userId, type: "open" }]).catch(() => undefined);
    }
  };

  const skip = (card: DiscoveryCard) => {
    setPeople((p) => p.filter((x) => x.userId !== card.userId));
    void client.recordEvents([{ candidateId: card.userId, type: "ignore" }]).catch(() => undefined);
    setNotice(`${card.displayName} will show up less often.`);
  };

  const doBlock = async (card: DiscoveryCard) => {
    try {
      await client.block(card.userId);
      setPeople((p) => p.filter((x) => x.userId !== card.userId));
      setNotice(`${card.displayName} is blocked. You can unblock under "Blocked people".`);
      if (blocks) setBlocks(await client.listBlocks());
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const confirmBlock = (card: DiscoveryCard) =>
    Alert.alert(
      `Block ${card.displayName}?`,
      "You will not see each other anywhere in the app.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: () => void doBlock(card) },
      ]
    );

  const showBlocks = async () => {
    try {
      setBlocks(await client.listBlocks());
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const unblock = async (id: string) => {
    try {
      await client.unblock(id);
      setBlocks((b) => (b ?? []).filter((x) => x.userId !== id));
      setNotice("Unblocked. They can appear in your feed again.");
      void load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <View style={styles.container}>
      {/* Editorial introduction header */}
      <View style={[styles.introBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, borderRadius: radius.md, padding: space[4] }]}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>✦ CALM DISCOVERY</Text>
        <Text style={[styles.introTitle, { color: colors.text, fontSize: type.title.size }]}>
          People you might click with
        </Text>
        <Text style={[styles.introMuted, { color: colors.textMuted, marginTop: space[1] }]}>
          Suggestions are based on shared interests and values. Every card explains why you see them. Your exact location is never shared.
        </Text>
      </View>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loaderText, { color: colors.textMuted, marginTop: space[3] }]}>
            Finding people who match your pace…
          </Text>
        </View>
      ) : people.length === 0 && !error ? (
        <EmptyState
          title="No one new right now"
          description="You've seen everyone who fits your criteria for now. Add more interests or prompts to your profile, or check back soon."
          actionLabel="Refresh feed"
          onAction={() => void load()}
        />
      ) : (
        people.map((card) => {
          const isExpanded = open === card.userId;
          return (
            <View
              key={card.userId}
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
              {/* Profile Card Header */}
              <View style={styles.head}>
                <Avatar name={card.displayName} url={photos[card.userId]} size="lg" />
                <View style={styles.headMeta}>
                  <Text style={[styles.name, { color: colors.text, fontSize: type.title.size }]}>
                    {card.displayName}
                  </Text>
                  <View style={styles.styleBadgeRow}>
                    {card.socialStyles.map((s) => (
                      <Badge key={s} label={STYLE_LABELS[s]} tone="neutral" compact />
                    ))}
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Report ${card.displayName}`}
                  onPress={() => setReportingUser({ id: card.userId, name: card.displayName })}
                  hitSlop={8}
                  style={styles.flagBtn}
                >
                  <Text style={[styles.flagText, { color: colors.textMuted }]}>⚑</Text>
                </Pressable>
              </View>

              {/* Match reasons with editorial star */}
              <View style={[styles.reasonsBox, { backgroundColor: colors.surfaceSunken, borderRadius: radius.sm, padding: space[3], marginTop: space[3] }]}>
                {card.reasons.slice(0, isExpanded ? 5 : 2).map((r) => (
                  <View key={r.code} style={styles.reasonRow}>
                    <Text style={[styles.reasonMark, { color: colors.accent }]}>✦</Text>
                    <Text style={[styles.reasonText, { color: colors.text2, fontSize: type.small.size }]}>
                      {r.text}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Bio snippet */}
              {card.bio ? (
                <Text style={[styles.bio, { color: colors.text, fontSize: type.body.size, marginTop: space[3] }]}>
                  {card.bio}
                </Text>
              ) : null}

              {/* Interests: shared prominent, others neutral */}
              <View style={[styles.chipsWrap, { marginTop: space[3] }]}>
                {card.interests.slice(0, isExpanded ? 12 : 5).map((i) => {
                  const shared = card.sharedInterests.some((x) => x.id === i.id);
                  return (
                    <Chip
                      key={i.id}
                      label={shared ? `✦ ${i.name}` : i.name}
                      accent={shared}
                    />
                  );
                })}
              </View>

              {/* Expanded prompts */}
              {isExpanded && card.prompts.length > 0 ? (
                <View style={[styles.promptsSection, { marginTop: space[3] }]}>
                  {card.prompts.map((p) => (
                    <View
                      key={p.promptId}
                      style={[
                        styles.promptCard,
                        {
                          backgroundColor: colors.surfaceSunken,
                          borderColor: colors.line,
                          borderRadius: radius.sm,
                          padding: space[3],
                          marginTop: space[2],
                        },
                      ]}
                    >
                      <Text style={[styles.promptTitle, { color: colors.accent, fontSize: type.caption.size }]}>
                        {p.prompt.toUpperCase()}
                      </Text>
                      <Text style={[styles.promptAnswer, { color: colors.text, fontSize: type.body.size, marginTop: space[1] }]}>
                        "{p.answer}"
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Interactive SayHi Panel */}
              {greeting === card.userId ? (
                <SayHi
                  card={card}
                  onClose={() => setGreeting(null)}
                  onSent={(msg) => {
                    setGreeting(null);
                    setNotice(msg);
                    void load();
                  }}
                />
              ) : null}

              {/* Relation state messaging */}
              {card.relation === "pending_in" ? (
                <View style={[styles.relationNote, { backgroundColor: colors.accentSoft, borderRadius: radius.sm, padding: space[3], marginTop: space[3] }]}>
                  <Text style={[styles.relationText, { color: colors.accent, fontSize: type.small.size }]}>
                    {card.displayName} said hi to you! Head to Connections to respond.
                  </Text>
                </View>
              ) : null}

              {card.relation === "pending_out" ? (
                <View style={[styles.relationNote, { backgroundColor: colors.surfaceSunken, borderRadius: radius.sm, padding: space[3], marginTop: space[3] }]}>
                  <Text style={[styles.relationText, { color: colors.textMuted, fontSize: type.small.size }]}>
                    You said hi. No pressure, they can respond anytime.
                  </Text>
                </View>
              ) : null}

              {/* Primary & secondary action buttons */}
              <View style={[styles.actionsRow, { marginTop: space[4] }]}>
                {card.relation === "none" && (
                  card.messagePermission === "nobody" ? (
                    <Text style={[styles.quietMuted, { color: colors.textMuted }]}>
                      Not accepting new connections
                    </Text>
                  ) : (
                    <Button
                      label="Say hi"
                      compact
                      onPress={() => setGreeting(greeting === card.userId ? null : card.userId)}
                    />
                  )
                )}

                <Button
                  label={isExpanded ? "Show less" : "View profile"}
                  secondary
                  compact
                  onPress={() => toggle(card)}
                />

                <Button
                  label="Not now"
                  secondary
                  compact
                  onPress={() => skip(card)}
                />

                <Button
                  label="Block"
                  danger
                  secondary
                  compact
                  onPress={() => confirmBlock(card)}
                />
              </View>
            </View>
          );
        })
      )}

      {/* Pagination & Refresh actions */}
      {!loading && hasMore ? (
        <Button
          label={loadingMore ? "Loading more people…" : "Show more people"}
          secondary
          onPress={() => void more()}
          disabled={loadingMore}
          style={{ marginTop: space[4] }}
        />
      ) : null}

      <View style={{ marginTop: space[4] }}>
        <Button
          label={blocks ? "Hide blocked people" : "Manage blocked people"}
          secondary
          compact
          onPress={() => void (blocks ? setBlocks(null) : showBlocks())}
        />
      </View>

      {/* Blocked Users section */}
      {blocks ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              borderRadius: radius.md,
              padding: space[4],
              marginTop: space[3],
            },
          ]}
        >
          <Text style={[styles.name, { color: colors.text, fontSize: type.title.size }]}>
            Blocked people
          </Text>
          {blocks.length === 0 ? (
            <Text style={[styles.introMuted, { color: colors.textMuted, marginTop: space[2] }]}>
              You haven't blocked anyone.
            </Text>
          ) : (
            blocks.map((b) => (
              <View
                key={b.userId}
                style={[
                  styles.blockedRow,
                  {
                    borderBottomColor: colors.line,
                    borderBottomWidth: 1,
                    paddingVertical: space[3],
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.blockedName, { color: colors.text, fontSize: type.body.size }]}>
                    {b.displayName}
                  </Text>
                  <Text style={[styles.introMuted, { color: colors.textMuted, fontSize: type.caption.size }]}>
                    Blocked
                  </Text>
                </View>
                <Button label="Unblock" secondary compact onPress={() => void unblock(b.userId)} />
              </View>
            ))
          )}
        </View>
      ) : null}

      {/* Safety Report Modal */}
      {reportingUser ? (
        <ReportSheet
          visible={Boolean(reportingUser)}
          targetType="profile"
          targetId={reportingUser.id}
          targetLabel={reportingUser.name}
          onClose={() => setReportingUser(null)}
          onSuccess={() => {
            setNotice(`Thank you. Your report for ${reportingUser.name} has been submitted.`);
            setPeople((p) => p.filter((x) => x.userId !== reportingUser.id));
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
  introBox: {
    borderWidth: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  introTitle: {
    fontWeight: "700",
    marginTop: 2,
  },
  introMuted: {
    fontSize: 13,
    lineHeight: 18,
  },
  loaderWrap: {
    paddingVertical: 48,
    alignItems: "center",
  },
  loaderText: {
    fontSize: 14,
    fontWeight: "500",
  },
  card: {
    borderWidth: 1,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headMeta: {
    flex: 1,
  },
  name: {
    fontWeight: "700",
  },
  styleBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  flagBtn: {
    padding: 8,
  },
  flagText: {
    fontSize: 16,
  },
  reasonsBox: {
    gap: 6,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  reasonMark: {
    fontSize: 11,
    marginTop: 2,
  },
  reasonText: {
    flex: 1,
    fontWeight: "500",
    lineHeight: 18,
  },
  bio: {
    lineHeight: 22,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  promptsSection: {
    gap: 8,
  },
  promptCard: {
    borderWidth: 1,
  },
  promptTitle: {
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  promptAnswer: {
    fontStyle: "italic",
    lineHeight: 20,
  },
  relationNote: {
    alignItems: "center",
  },
  relationText: {
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  quietMuted: {
    fontSize: 13,
    fontStyle: "italic",
  },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  blockedName: {
    fontWeight: "600",
  },
});
