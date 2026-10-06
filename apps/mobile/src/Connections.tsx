import type { ConnectionRequestView, ConnectionView, PersonSummary } from "@sp/types";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { errorMessage } from "./auth";
import { getConnectionsClient } from "./connectionClient";
import { getSignedMediaUrl } from "./profile";

const STATUS_TEXT = { pending: "Waiting. They can reply any time in the next two weeks.", accepted: "Connected", no_reply: "No reply yet. That is okay, people reply on their own time." } as const;

function Btn({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={c.btn}><Text style={[c.btnText, danger && c.danger]}>{label}</Text></Pressable>;
}
function Person({ person, url, sub }: { person: PersonSummary; url?: string; sub?: string }) {
  return <View style={c.head}>
    {url ? <Image source={{ uri: url }} style={c.avatar} accessibilityLabel={`${person.displayName}'s profile`} /> : <View style={[c.avatar, c.ph]}><Text style={c.letter}>{person.displayName.slice(0, 1).toUpperCase()}</Text></View>}
    <View style={{ flex: 1 }}><Text style={c.name}>{person.displayName}</Text><Text style={c.muted}>{sub ?? person.bio}</Text></View>
  </View>;
}

export function Connections({ onCount, onMessage }: { onCount?: (pending: number) => void; onMessage?: (userId: string) => void }) {
  const client = getConnectionsClient();
  const [incoming, setIncoming] = useState<ConnectionRequestView[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequestView[]>([]);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [lowPressure, setLowPressure] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [inc, out, con, settings] = await Promise.all([client.listRequests("incoming"), client.listRequests("outgoing"), client.listConnections(), client.getSettings()]);
      setIncoming(inc); setOutgoing(out); setConnections(con); setLowPressure(settings.lowPressureMode); onCount?.(inc.length);
      const people = [...inc.map((r) => r.other), ...out.map((r) => r.other), ...con.map((x) => x.other)].filter((p) => p.thumbnailPath);
      const pairs = await Promise.all(people.map(async (p) => { try { return [p.userId, await getSignedMediaUrl(p.thumbnailPath!)] as const; } catch { return null; } }));
      setPhotos(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)));
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [client, onCount]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, message: string) => { setError(null); try { await fn(); setNotice(message); await load(); } catch (err) { setError(errorMessage(err)); } };
  const toggle = async (next: boolean) => { setError(null); try { setLowPressure((await client.setLowPressure(next)).lowPressureMode); setNotice(next ? "Low-pressure mode is on." : "Low-pressure mode is off."); } catch (err) { setError(errorMessage(err)); } };
  const remove = (x: ConnectionView) => Alert.alert(`Remove ${x.other.displayName}?`, "They will be removed from your connections.", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => void act(() => client.removeConnection(x.other.userId), "Connection removed.") }]);

  return <View>
    {error && <Text style={c.err} accessibilityRole="alert">{error}</Text>}
    {notice && <Text style={c.ok}>{notice}</Text>}
    <View style={c.card}>
      <View style={c.row}><View style={{ flex: 1 }}><Text style={c.name}>Low-pressure mode</Text><Text style={c.muted}>People can only send you a suggested opener. You never have to answer: requests quietly expire after two weeks, and "Not now" is never shown to the sender.</Text></View><Switch value={lowPressure} onValueChange={(v) => void toggle(v)} accessibilityLabel="Low-pressure mode" /></View>
    </View>
    {loading ? <ActivityIndicator style={{ padding: 24 }} /> : <>
      <Text style={c.h2}>Said hi to you {incoming.length > 0 ? `(${incoming.length})` : ""}</Text>
      {incoming.length === 0 ? <View style={c.card}><Text style={c.muted}>Nothing waiting. When someone says hi, it shows up here, and there is no rush to answer.</Text></View>
        : incoming.map((r) => <View style={c.card} key={r.id}><Person person={r.other} url={photos[r.other.userId]} /><Text style={c.intro}>{r.intro.text}</Text>
          <View style={c.row}><Btn label="Connect" onPress={() => void act(() => client.accept(r.id), `You are now connected with ${r.other.displayName}.`)} /><Btn label="Not now" onPress={() => void act(() => client.decline(r.id), "Done. They will not be told.")} /></View></View>)}
      <Text style={c.h2}>Your connections</Text>
      {connections.length === 0 ? <View style={c.card}><Text style={c.muted}>No connections yet. Say hi to someone in Discover. Pick an opener and you are done.</Text></View>
        : connections.map((x) => <View style={c.card} key={x.other.userId}><Person person={x.other} url={photos[x.other.userId]} /><View style={c.row}>{onMessage && <Btn label="Message" onPress={() => onMessage(x.other.userId)} />}<Btn label="Remove" danger onPress={() => remove(x)} /></View></View>)}
      {outgoing.length > 0 && <><Text style={c.h2}>Your hellos</Text>{outgoing.map((r) => <View style={c.card} key={r.id}><Person person={r.other} url={photos[r.other.userId]} sub={STATUS_TEXT[r.status]} /><Text style={c.intro}>{r.intro.text}</Text>{r.status === "pending" && <View style={c.row}><Btn label="Withdraw" onPress={() => void act(() => client.withdraw(r.id), "Hello withdrawn.")} /></View>}</View>)}</>}
    </>}
  </View>;
}

const c = StyleSheet.create({
  card: { borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 16, padding: 14, marginTop: 12, backgroundColor: "#fff", gap: 8 },
  h2: { fontSize: 18, fontWeight: "700", color: "#152033", marginTop: 18 }, name: { fontSize: 16, fontWeight: "700", color: "#152033" }, muted: { fontSize: 14, color: "#667085" },
  err: { color: "#b42318", fontSize: 14, marginTop: 6 }, ok: { color: "#167647", fontSize: 14, marginTop: 6 },
  head: { flexDirection: "row", gap: 12, alignItems: "center" }, row: { flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#eef2ff" }, ph: { alignItems: "center", justifyContent: "center" }, letter: { fontSize: 20, fontWeight: "800", color: "#4f46e5" },
  intro: { borderLeftWidth: 4, borderLeftColor: "#4f46e5", backgroundColor: "#eef2ff", padding: 10, borderRadius: 8, fontWeight: "600", color: "#152033", fontSize: 15 },
  btn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: "#bfc7dd", backgroundColor: "#fff" }, btnText: { color: "#4f46e5", fontWeight: "700", fontSize: 14 }, danger: { color: "#b42318" },
});
