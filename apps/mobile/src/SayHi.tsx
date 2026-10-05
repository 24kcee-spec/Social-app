import type { DiscoveryCard, StarterSet } from "@sp/types";
import type { IntroInput } from "@sp/validation";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { errorMessage } from "./auth";
import { getConnectionsClient } from "./connectionClient";

function Opt({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[h.opt, disabled && h.off]}><Text style={h.optText}>{label}</Text></Pressable>;
}

/** Pick-a-starter panel: the person chooses an opener, they never have to invent one. */
export function SayHi({ card, onSent, onClose }: { card: DiscoveryCard; onSent: (message: string) => void; onClose: () => void }) {
  const client = getConnectionsClient();
  const [starters, setStarters] = useState<StarterSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    let alive = true;
    client.getStarters(card.userId).then((s) => alive && setStarters(s)).catch((e) => alive && setError(errorMessage(e)));
    return () => { alive = false; };
  }, [client, card.userId]);

  const send = async (intro: IntroInput) => {
    setBusy(true); setError(null);
    try { const r = await client.sendRequest(card.userId, intro); onSent(r.status === "connected" ? `You and ${card.displayName} are now connected!` : `Hi sent to ${card.displayName}. No pressure, they can reply whenever they like.`); }
    catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  return <View style={h.box}>
    <Text style={h.muted}>Pick an opener. {card.displayName} sees it with your profile and can reply when they are ready.</Text>
    {error && <Text style={h.err} accessibilityRole="alert">{error}</Text>}
    {!starters && !error && <Text style={h.muted}>Finding good openers…</Text>}
    {starters && <>
      {starters.icebreakers.length > 0 && <><Text style={h.h4}>ABOUT WHAT YOU SHARE</Text>{starters.icebreakers.map((s) => <Opt key={s.ref} label={s.text} disabled={busy} onPress={() => void send({ kind: "icebreaker", ref: s.ref })} />)}</>}
      {starters.questions.length > 0 && <><Text style={h.h4}>QUESTION CARDS</Text>{starters.questions.map((s) => <Opt key={s.ref} label={s.text} disabled={busy} onPress={() => void send({ kind: "question", ref: s.ref })} />)}</>}
      {starters.games.length > 0 && <><Text style={h.h4}>THIS OR THAT - I PICK…</Text>{starters.games.map((g) => <View key={g.ref} style={h.game}><Opt label={g.optionA} disabled={busy} onPress={() => void send({ kind: "this_or_that", ref: g.ref, choice: "a" })} /><Text style={h.muted}>or</Text><Opt label={g.optionB} disabled={busy} onPress={() => void send({ kind: "this_or_that", ref: g.ref, choice: "b" })} /></View>)}</>}
      {starters.allowCustom ? (writing
        ? <View><TextInput style={h.input} value={custom} onChangeText={setCustom} maxLength={240} multiline placeholder="Your own short note" accessibilityLabel="Your own short note" /><Opt label="Send note" disabled={busy || custom.trim().length < 2} onPress={() => void send({ kind: "custom", text: custom })} /></View>
        : <Opt label="Write my own instead" onPress={() => setWriting(true)} />)
        : <Text style={h.muted}>{card.displayName} prefers a low-pressure start, so only these openers are available.</Text>}
    </>}
    <Opt label="Cancel" onPress={onClose} />
  </View>;
}

const h = StyleSheet.create({
  box: { backgroundColor: "#fafbff", borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 12, padding: 12, gap: 8 },
  muted: { fontSize: 14, color: "#667085" }, err: { color: "#b42318", fontSize: 14 }, h4: { fontSize: 11, fontWeight: "700", color: "#667085", marginTop: 4, letterSpacing: 0.5 },
  opt: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#bfc7dd", backgroundColor: "#fff" }, optText: { color: "#152033", fontWeight: "600", fontSize: 15 }, off: { opacity: 0.55 },
  game: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  input: { borderWidth: 1, borderColor: "#bfc7dd", borderRadius: 10, padding: 10, minHeight: 60, backgroundColor: "#fff", fontSize: 15 },
});
