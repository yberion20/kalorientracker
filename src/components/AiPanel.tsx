import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { getSettings } from "../db";
import { type AiResult, analyzePhoto, analyzeText, fileToJpegBase64 } from "../lib/ai";
import { type FoodSnapshot, type Nutrients, fmt, scale, sum } from "../lib/nutrition";
import { NumberInput, NutriGrid } from "./ui";

export type AddFn = (items: { food: FoodSnapshot; amount: number }[]) => void;

interface EditItem {
  include: boolean;
  name: string;
  amount: number | "";
  unit: "g" | "ml";
  per100: Nutrients;
  confidence: string;
}

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

function getSpeech(): (new () => SpeechRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** API-Key und Modell aus den Einstellungen (undefined, solange geladen wird). */
export function useAiConfig() {
  const s = useLiveQuery(getSettings);
  return s ? { apiKey: s.apiKey, model: s.aiModel } : undefined;
}

export function NoKeyNotice({ goToSettings }: { goToSettings?: () => void }) {
  return (
    <div className="card stack">
      <h3>KI-Modus einrichten</h3>
      <p className="muted small" style={{ margin: 0 }}>
        Für Sprach- und Foto-Erkennung braucht die App einen Claude-API-Key. Den trägst du einmal in den Einstellungen ein. Er bleibt
        nur auf diesem Gerät.
      </p>
      {goToSettings && (
        <button className="btn primary block" onClick={goToSettings}>
          Zu den Einstellungen
        </button>
      )}
    </div>
  );
}

/** Foto an die KI schicken und das Ergebnis zur Prüfung anzeigen. */
export function PhotoAnalysis({
  photo,
  onAdd,
  onDone,
  goToSettings,
}: {
  photo: { base64: string; previewUrl: string };
  onAdd: AddFn;
  onDone: () => void;
  goToSettings?: () => void;
}) {
  const cfg = useAiConfig();
  const [hint, setHint] = useState("");
  const [state, setState] = useState<"busy" | "error" | "done">("busy");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AiResult | null>(null);
  const started = useRef(false);

  const run = async (h = hint) => {
    if (!cfg?.apiKey) return;
    setState("busy");
    try {
      setResult(await analyzePhoto(cfg.apiKey, cfg.model, photo.base64, h.trim() || undefined));
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  useEffect(() => {
    if (cfg?.apiKey && !started.current) {
      started.current = true;
      run("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.apiKey]);

  if (!cfg) return null;
  if (!cfg.apiKey)
    return (
      <div className="stack">
        <img className="photo-preview" src={photo.previewUrl} alt="" />
        <NoKeyNotice goToSettings={goToSettings} />
        <button className="btn block" onClick={onDone}>
          Zurück
        </button>
      </div>
    );

  if (state === "done" && result)
    return (
      <AiReview
        result={result}
        photoUrl={photo.previewUrl}
        onAdd={(items) => {
          onAdd(items);
          onDone();
        }}
        onDiscard={onDone}
      />
    );

  return (
    <div className="stack">
      <img className="photo-preview" src={photo.previewUrl} alt="" />
      {state === "busy" && (
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="spinner" /> <span className="muted">KI analysiert das Foto …</span>
        </div>
      )}
      {state === "error" && (
        <>
          <div className="notice error">{error}</div>
          <input
            className="input"
            placeholder="Optional: Zusatzinfo, z. B. „mit Olivenöl gebraten“"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
          />
          <button className="btn primary block" onClick={() => run()}>
            Nochmal versuchen
          </button>
        </>
      )}
      <button className="btn block" onClick={onDone}>
        {state === "busy" ? "Abbrechen" : "Zurück zur Kamera"}
      </button>
    </div>
  );
}

/** Bearbeitbare Vorschau einer KI-Schätzung. */
export function AiReview({
  result,
  photoUrl,
  onAdd,
  onDiscard,
}: {
  result: AiResult;
  photoUrl?: string;
  onAdd: AddFn;
  onDiscard: () => void;
}) {
  const [items, setItems] = useState<EditItem[]>(() =>
    result.items.map((i) => ({
      include: true,
      name: i.name,
      amount: Math.round(i.amount),
      unit: i.unit,
      confidence: i.confidence,
      per100: { kcal: i.kcal_per_100, protein: i.protein_per_100, carbs: i.carbs_per_100, fat: i.fat_per_100 },
    })),
  );
  const chosen = items.filter((i) => i.include && i.amount);
  const total = sum(chosen.map((i) => scale(i.per100, i.amount || 0)));
  const update = (idx: number, patch: Partial<EditItem>) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  return (
    <div className="stack">
      {photoUrl && <img className="photo-preview" src={photoUrl} alt="" />}
      {result.notes && <div className="notice">{result.notes}</div>}
      {items.length === 0 ? (
        <div className="empty">Keine Lebensmittel erkannt.</div>
      ) : (
        <div className="card">
          {items.map((it, idx) => {
            const n = scale(it.per100, it.amount || 0);
            return (
              <div className="ai-item" key={idx} style={{ opacity: it.include ? 1 : 0.45 }}>
                <div className="row">
                  <input
                    type="checkbox"
                    checked={it.include}
                    onChange={(e) => update(idx, { include: e.target.checked })}
                    style={{ width: 22, height: 22, accentColor: "var(--accent)" }}
                  />
                  <input className="input grow" value={it.name} onChange={(e) => update(idx, { name: e.target.value })} />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <div style={{ width: 110 }} className="row">
                    <NumberInput value={it.amount} onChange={(v) => update(idx, { amount: v })} />
                    <span className="muted">{it.unit}</span>
                  </div>
                  <div className="grow small" style={{ textAlign: "right" }}>
                    <b>{fmt(n.kcal)} kcal</b>
                    <div className="muted">
                      KH {fmt(n.carbs)} · E {fmt(n.protein)} · F {fmt(n.fat)} g
                    </div>
                  </div>
                </div>
                <details style={{ marginTop: 6 }}>
                  <summary className="small muted">
                    Werte pro 100 {it.unit} anpassen · Sicherheit: {it.confidence}
                  </summary>
                  <div className="mini">
                    {(["kcal", "carbs", "protein", "fat"] as const).map((k) => (
                      <label className="field" key={k}>
                        <span>{{ kcal: "kcal", carbs: "KH", protein: "Eiweiß", fat: "Fett" }[k]}</span>
                        <NumberInput value={round1(it.per100[k])} onChange={(v) => update(idx, { per100: { ...it.per100, [k]: v || 0 } })} />
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
      {items.length > 0 && <NutriGrid n={total} />}
      <button
        className="btn primary block"
        disabled={!chosen.length}
        onClick={() =>
          onAdd(
            chosen.map((i) => ({
              food: { name: i.name || "KI-Schätzung", per100: i.per100, unit: i.unit, source: "ai" },
              amount: i.amount as number,
            })),
          )
        }
      >
        {chosen.length} {chosen.length === 1 ? "Eintrag" : "Einträge"} übernehmen
      </button>
      <button className="btn block" onClick={onDiscard}>
        Verwerfen
      </button>
    </div>
  );
}

/** Tab „Beschreiben“: Mahlzeit per Text oder Sprache schätzen lassen. */
export function AiPanel({ onAdd, goToSettings }: { onAdd: AddFn; goToSettings?: () => void }) {
  const cfg = useAiConfig();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);
  const [photo, setPhoto] = useState<{ base64: string; previewUrl: string } | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const Speech = getSpeech();

  useEffect(() => () => recRef.current?.stop(), []);

  if (!cfg) return null;
  if (!cfg.apiKey) return <NoKeyNotice goToSettings={goToSettings} />;

  if (photo)
    return <PhotoAnalysis photo={photo} onAdd={onAdd} onDone={() => setPhoto(null)} goToSettings={goToSettings} />;

  if (result)
    return (
      <AiReview
        result={result}
        onAdd={(items) => {
          onAdd(items);
          setResult(null);
          setText("");
        }}
        onDiscard={() => setResult(null)}
      />
    );

  const runText = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await analyzeText(cfg.apiKey!, cfg.model, text));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (!Speech) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Speech();
    rec.lang = "de-DE";
    rec.continuous = true;
    rec.interimResults = false;
    const base = text ? text.trimEnd() + " " : "";
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(base + t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h3>🎙️ Beschreiben oder diktieren</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Schreib oder sprich, was du gegessen hast. Tipp: das Mikrofon auf der iPhone-Tastatur nutzen.
        </p>
        <textarea
          className="input"
          placeholder="z. B. „Zwei Scheiben Vollkornbrot mit Butter und Gouda, dazu ein Glas Orangensaft“"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row">
          {Speech && (
            <button className={`btn${listening ? " primary" : ""}`} onClick={toggleMic} disabled={busy}>
              {listening ? "■ Stopp" : "🎤 Sprechen"}
            </button>
          )}
          <button className="btn primary grow" disabled={busy || text.trim().length < 3} onClick={runText}>
            Analysieren
          </button>
        </div>
      </div>
      {busy && (
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="spinner" /> <span className="muted">KI analysiert …</span>
        </div>
      )}
      {error && <div className="notice error">{error}</div>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) setPhoto(await fileToJpegBase64(f));
        }}
      />
      <button className="btn block" onClick={() => fileRef.current?.click()}>
        🖼️ Vorhandenes Foto aus der Mediathek analysieren
      </button>
      <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
        Neue Fotos machst du direkt im Tab „Kamera“.
      </p>
    </div>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
