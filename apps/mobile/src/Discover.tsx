import type { BlockedUser, DiscoveryCard, SocialStyle } from "@sp/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { errorMessage } from "./auth";
import { getDiscoveryClient } from "./discovery";
import { getSignedMediaUrl } from "./profile";

const STYLE_LABELS: Record<SocialStyle, string> = { small_group: "Small groups", one_to_one: "One-to-one", text_first: "Text-first", voice_first: "Voice-first", low_pressure: "Low pressure" };
const PAGE = 12;

function Btn({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[d.btn, disabled && d.disabled]}><Text style={[d.btnText, danger && d.danger]}>{label}</Text></Pressable>;
}

export function Discover() {
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
  const seen = useRef<Set<string>>(new Set());

  const loadPhotos = useCallback(async (cards: DiscoveryCard[]) => {
    const pairs = await Promise.all(cards.filter((c) => c.thumbnailPath).map(async (c) => { try { return [c.userId, await getSignedMediaUrl(c.thumbnailPath!)] as const; } catch { return null; } }));
    setPhotos((cur) => ({ ...cur, ...Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)) }));
  }, []);

  const track = useCallback((cards: DiscoveryCard[]) => {
    const fresh = cards.filter((c) => !seen.current.has(c.userId));
    fresh.forEach((c) => seen.current.add(c.userId));
    if (fresh.length) void client.recordEvents(fresh.map((c) => ({ candidateId: c.userId, type: "impression" as const }))).catch(() => undefined);
  }, [client]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const feed = await client.getPeople(PAGE, 0); setPeople(feed.people); setHasMore(feed.hasMore); track(feed.people); void loadPhotos(feed.people); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [client, loadPhotos, track]);
  useEffect(() => { void load(); }, [load]);

  const more = async () => {
    setLoadingMore(true); setError(null);
    try {
      const feed = await client.getPeople(PAGE, people.length);
      const known = new Set(people.map((p) => p.userId));
      const added = feed.people.filter((p) => !known.has(p.userId));
      setPeople([...people, ...added]); setHasMore(feed.hasMore); track(added); void loadPhotos(added);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoadingMore(false); }
  };

  const toggle = (card: DiscoveryCard) => {
    const next = open === card.userId ? null : card.userId;
    setOpen(next);
    if (next) void client.recordEvents([{ candidateId: card.userId, type: "open" }]).catch(() => undefined);
  };
  const skip = (card: DiscoveryCard) => { setPeople((p) => p.filter((x) => x.userId !== card.userId)); void client.recordEvents([{ candidateId: card.userId, type: "ignore" }]).catch(() => undefined); setNotice(`${card.displayName} will show up less often.`); };
  const doBlock = async (card: DiscoveryCard) => {
    try { await client.block(card.userId); setPeople((p) => p.filter((x) => x.userId !== card.userId)); setNotice(`${card.displayName} is blocked. You can undo this under "Blocked people".`); if (blocks) setBlocks(await client.listBlocks()); }
    catch (err) { setError(errorMessage(err)); }
  };
  const confirmBlock = (card: DiscoveryCard) => Alert.alert(`Block ${card.displayName}?`, "You will not see each other anywhere in the app.", [{ text: "Cancel", style: "cancel" }, { text: "Block", style: "destructive", onPress: () => void doBlock(card) }]);
  const showBlocks = async () => { try { setBlocks(await client.listBlocks()); } catch (err) { setError(errorMessage(err)); } };
  const unblock = async (id: string) => { try { await client.unblock(id); setBlocks((b) => (b ?? []).filter((x) => x.userId !== id)); setNotice("Unblocked. They can appear in your feed again."); void load(); } catch (err) { setError(errorMessage(err)); } };

  return <View>
    <Text style={d.muted}>People are suggested from what you share. Every card tells you why. Nobody is shown your exact location.</Text>
    <Btn label="Refresh" onPress={() => void load()} disabled={loading} />
    {error && <Text style={d.err} accessibilityRole="alert">{error}</Text>}
    {notice && <Text style={d.ok}>{notice}</Text>}
    {loading ? <ActivityIndicator style={d.pad} />
      : people.length === 0 && !error ? <View style={d.card}><Text style={d.h2}>No one new right now</Text><Text style={d.muted}>You have seen everyone who fits for now. Add more interests or prompts to your profile, or check back soon.</Text></View>
      : people.map((card) => <View style={d.card} key={card.userId}>
        <View style={d.head}>
          {photos[card.userId] ? <Image source={{ uri: photos[card.userId] }} style={d.avatar} accessibilityLabel={`${card.displayName}'s profile`} /> : <View style={[d.avatar, d.avatarPlaceholder]}><Text style={d.avatarLetter}>{card.displayName.slice(0, 1).toUpperCase()}</Text></View>}
          <View style={d.headText}><Text style={d.h2}>{card.displayName}</Text><Text style={d.styles}>{card.socialStyles.map((s) => STYLE_LABELS[s]).join(" · ")}</Text></View>
        </View>
        {card.reasons.slice(0, open === card.userId ? 5 : 2).map((r) => <View style={d.reason} key={r.code}><Text style={d.reasonText}>{r.text}</Text></View>)}
        {!!card.bio && <Text style={d.bio}>{card.bio}</Text>}
        <View style={d.tags}>{card.interests.slice(0, open === card.userId ? 12 : 5).map((i) => { const shared = card.sharedInterests.some((x) => x.id === i.id); return <View key={i.id} style={[d.tag, shared && d.tagShared]}><Text style={shared ? d.tagSharedText : d.tagText}>{i.name}</Text></View>; })}</View>
        {open === card.userId && card.prompts.map((p) => <View key={p.promptId} style={d.prompt}><Text style={d.promptTitle}>{p.prompt}</Text><Text style={d.bio}>{p.answer}</Text></View>)}
        <View style={d.actions}><Btn label={open === card.userId ? "Show less" : "View profile"} onPress={() => toggle(card)} /><Btn label="Not now" onPress={() => skip(card)} /><Btn label="Block" danger onPress={() => confirmBlock(card)} /></View>
      </View>)}
    {!loading && hasMore && <Btn label={loadingMore ? "Loading…" : "Show more people"} onPress={() => void more()} disabled={loadingMore} />}
    <Btn label={blocks ? "Hide blocked people" : "Blocked people"} onPress={() => void (blocks ? setBlocks(null) : showBlocks())} />
    {blocks && <View style={d.card}><Text style={d.h2}>Blocked people</Text>{blocks.length === 0 ? <Text style={d.muted}>You have not blocked anyone.</Text> : blocks.map((b) => <View key={b.userId} style={d.blockRow}><Text style={d.bio}>{b.displayName}</Text><Btn label="Unblock" onPress={() => void unblock(b.userId)} /></View>)}</View>}
  </View>;
}

const d = StyleSheet.create({
  muted: { fontSize: 14, color: "#667085", marginBottom: 8 }, err: { color: "#b42318", fontSize: 14, marginTop: 6 }, ok: { color: "#167647", fontSize: 14, marginTop: 6 }, pad: { padding: 24 },
  card: { borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 16, padding: 14, marginTop: 14, backgroundColor: "#fff", gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 }, headText: { flex: 1 }, h2: { fontSize: 20, fontWeight: "700", color: "#152033" }, styles: { fontSize: 12, color: "#667085", marginTop: 2 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#eef2ff" }, avatarPlaceholder: { alignItems: "center", justifyContent: "center" }, avatarLetter: { fontSize: 26, fontWeight: "800", color: "#4f46e5" },
  reason: { backgroundColor: "#eef2ff", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 }, reasonText: { color: "#4f46e5", fontWeight: "600", fontSize: 14 },
  bio: { fontSize: 15, color: "#344054" }, tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, tag: { backgroundColor: "#f2f4f7", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 }, tagShared: { backgroundColor: "#eef2ff" },
  tagText: { color: "#475467", fontSize: 12 }, tagSharedText: { color: "#4f46e5", fontSize: 12, fontWeight: "700" },
  prompt: { borderTopWidth: 1, borderTopColor: "#eef2f7", paddingTop: 8 }, promptTitle: { fontSize: 14, fontWeight: "700", color: "#152033" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }, blockRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  btn: { marginTop: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#bfc7dd", backgroundColor: "#fff" }, btnText: { color: "#4f46e5", fontWeight: "700", fontSize: 14 }, danger: { color: "#b42318" }, disabled: { opacity: 0.55 },
});
