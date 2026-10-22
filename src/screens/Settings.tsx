import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { NumberInput, Toggle } from "../components/ui";
import { type Settings as S, db, getSettings, saveSettings } from "../db";
import { AI_MODELS, testKey } from "../lib/ai";
import { importBackup, shareOrDownloadBackup } from "../lib/backup";
import { SHORTCUT_NAME } from "../lib/health";
import {
  ACTIVITY,
  type Activity,
  type GoalType,
  type Profile,
  type Sex,
  bmr,
  calorieTarget,
  fmt,
  macroGrams,
  tdee,
} from "../lib/nutrition";

export function Settings() {
  const settings = useLiveQuery(getSettings);
  // null = noch kein Gewicht eingetragen, undefined = lädt noch
  const latestWeight = useLiveQuery(async () => (await db.weights.orderBy("date").last()) ?? null, []);
  if (!settings || latestWeight === undefined) return null;
  return (
    <div>
      <h1>Einstellungen</h1>
      <GoalsCard settings={settings} latestKg={latestWeight?.kg} />
      <AiCard settings={settings} />
      <HealthCard settings={settings} />
      <BackupCard settings={settings} />
      <p className="muted small" style={{ textAlign: "center", margin: "24px 0" }}>
        Lebensmitteldaten: Open Food Facts (ODbL) · Alle Daten bleiben auf diesem Gerät.
      </p>
    </div>
  );
}

// ---------- Ziele ----------

function GoalsCard({ settings, latestKg }: { settings: S; latestKg?: number }) {
  const p0: Profile = settings.profile ?? {
    sex: "male",
    age: 35,
    heightCm: 178,
    weightKg: latestKg ?? 80,
    activity: "light",
    goal: "lose",
    rateKgPerWeek: 0.5,
  };
  const [p, setP] = useState<Profile>({ ...p0, weightKg: latestKg ?? p0.weightKg });
  const [split, setSplit] = useState(settings.split);
  const [kcal, setKcal] = useState<number | "">(settings.goals.kcal);
  const [water, setWater] = useState<number | "">(settings.goals.waterMl / 1000);
  const [saved, setSaved] = useState(false);

  const suggested = calorieTarget(p);
  const grams = macroGrams(kcal || 0, split);
  const splitSum = split.protein + split.carbs + split.fat;

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));

  const save = async () => {
    await saveSettings({
      profile: p,
      split,
      goals: { kcal: kcal || suggested, ...grams, waterMl: Math.round((water || 2.5) * 1000) },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="card stack">
      <h2>🎯 Ziele</h2>
      <div className="segment">
        {(["male", "female"] as Sex[]).map((s) => (
          <button key={s} className={p.sex === s ? "active" : ""} onClick={() => set("sex", s)}>
            {s === "male" ? "Mann" : "Frau"}
          </button>
        ))}
      </div>
      <div className="grid2">
        <label className="field">
          <span>Alter</span>
          <NumberInput value={p.age} onChange={(v) => set("age", v || 0)} />
        </label>
        <label className="field">
          <span>Größe (cm)</span>
          <NumberInput value={p.heightCm} onChange={(v) => set("heightCm", v || 0)} />
        </label>
        <label className="field">
          <span>Gewicht (kg)</span>
          <NumberInput value={p.weightKg} onChange={(v) => set("weightKg", v || 0)} />
        </label>
        <label className="field">
          <span>Zielgewicht (kg)</span>
          <NumberInput value={p.targetWeightKg ?? ""} onChange={(v) => set("targetWeightKg", v || undefined)} />
        </label>
      </div>
      <label className="field">
        <span>Aktivität (ohne gesondert erfasste Workouts)</span>
        <select className="input" value={p.activity} onChange={(e) => set("activity", e.target.value as Activity)}>
          {ACTIVITY.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <div className="segment">
        {(
          [
            ["lose", "Abnehmen"],
            ["maintain", "Halten"],
            ["gain", "Zunehmen"],
          ] as [GoalType, string][]
        ).map(([g, l]) => (
          <button key={g} className={p.goal === g ? "active" : ""} onClick={() => set("goal", g)}>
            {l}
          </button>
        ))}
      </div>
      {p.goal !== "maintain" && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="small muted">Tempo pro Woche:</span>
          {[0.25, 0.5, 0.75, 1].map((r) => (
            <button key={r} className={`chip${p.rateKgPerWeek === r ? " active" : ""}`} onClick={() => set("rateKgPerWeek", r)}>
              {r.toLocaleString("de-DE")} kg
            </button>
          ))}
        </div>
      )}
      <div className="notice small">
        Grundumsatz {fmt(bmr(p))} kcal · Gesamtumsatz {fmt(tdee(p))} kcal
        <br />
        Empfehlung: <b>{fmt(suggested)} kcal</b> pro Tag{" "}
        <button className="btn small" style={{ marginLeft: 6 }} onClick={() => setKcal(suggested)}>
          Übernehmen
        </button>
      </div>

      <div className="grid2">
        <label className="field">
          <span>Kalorienziel (kcal)</span>
          <NumberInput value={kcal} onChange={setKcal} />
        </label>
        <label className="field">
          <span>Wasserziel (Liter)</span>
          <NumberInput value={water} onChange={setWater} />
        </label>
      </div>

      <div className="section-title" style={{ margin: "6px 0 0" }}>
        Makro-Verteilung (% der kcal)
      </div>
      <div className="grid4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {(
          [
            ["carbs", "Kohlenh.", "var(--carbs)"],
            ["protein", "Eiweiß", "var(--protein)"],
            ["fat", "Fett", "var(--fat)"],
          ] as const
        ).map(([k, l, c]) => (
          <label className="field" key={k}>
            <span style={{ color: c, fontWeight: 600 }}>{l} %</span>
            <NumberInput value={split[k]} onChange={(v) => setSplit((s) => ({ ...s, [k]: v || 0 }))} />
            <span className="small muted" style={{ marginTop: 4 }}>
              = {grams[k]} g
            </span>
          </label>
        ))}
      </div>
      {splitSum !== 100 && <div className="notice warn small">Die Summe ist {splitSum} % – sie sollte 100 % ergeben.</div>}
      <button className="btn primary block" onClick={save} disabled={splitSum !== 100 || !kcal}>
        {saved ? "Gespeichert ✓" : "Ziele speichern"}
      </button>
    </div>
  );
}

// ---------- KI ----------

function AiCard({ settings }: { settings: S }) {
  const [key, setKey] = useState(settings.apiKey ?? "");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setKey(settings.apiKey ?? "");
  }, [settings.apiKey]);

  const save = async () => {
    const k = key.trim();
    await saveSettings({ apiKey: k || undefined });
    if (!k) return setStatus({ ok: true, msg: "Key entfernt." });
    setTesting(true);
    setStatus(null);
    try {
      await testKey(k, settings.aiModel);
      setStatus({ ok: true, msg: "Key funktioniert ✓" });
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card stack">
      <h2>✨ KI-Modus</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Für Foto- und Spracherkennung. Einen API-Key bekommst du auf <b>console.anthropic.com</b> (Settings › API Keys). Bezahlt wird
        pro Nutzung. Setz dort am besten ein monatliches Ausgabenlimit. Der Key bleibt nur auf diesem Gerät und kommt nicht ins Backup.
      </p>
      <label className="field">
        <span>Claude API-Key</span>
        <div className="row">
          <input
            className="input grow"
            type={show ? "text" : "password"}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button className="icon-btn" onClick={() => setShow(!show)} aria-label="Anzeigen">
            {show ? "🙈" : "👁"}
          </button>
        </div>
      </label>
      <label className="field">
        <span>Modell</span>
        <select className="input" value={settings.aiModel} onChange={(e) => saveSettings({ aiModel: e.target.value })}>
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <button className="btn primary block" onClick={save} disabled={testing}>
        {testing ? <span className="spinner" /> : "Speichern & testen"}
      </button>
      {status && <div className={`notice small${status.ok ? "" : " error"}`}>{status.msg}</div>}
    </div>
  );
}

// ---------- Health ----------

function HealthCard({ settings }: { settings: S }) {
  return (
    <div className="card stack">
      <h2>❤️ Apple Health</h2>
      <div className="row between">
        <div className="grow small">Aktive Kalorien zum Tagesbudget addieren</div>
        <Toggle checked={settings.addActiveKcalToBudget} onChange={(v) => saveSettings({ addActiveKcalToBudget: v })} />
      </div>
      <details>
        <summary style={{ fontWeight: 600 }}>Kurzbefehl einrichten (einmalig, ca. 3 Min.)</summary>
        <p className="small muted">
          Web-Apps dürfen Health nicht direkt lesen. Ein Kurzbefehl liest deshalb Schritte und aktive Kalorien und kopiert sie. In der
          App tippst du dann auf „Einfügen“.
        </p>
        <ol className="steps small">
          <li>
            App <b>Kurzbefehle</b> öffnen › <b>＋</b> › Name: <code>{SHORTCUT_NAME}</code> (genau so).
          </li>
          <li>
            Aktion <b>„Health-Messwerte suchen“</b> hinzufügen: Typ <b>Schritte</b>, Filter <b>Startdatum ist heute</b>.
          </li>
          <li>
            Aktion <b>„Statistik berechnen“</b> (bzw. „Berechnen“ › Summe) auf das Ergebnis anwenden: <b>Summe</b>.
          </li>
          <li>
            Nochmal <b>„Health-Messwerte suchen“</b>: Typ <b>Aktive Energie</b>, <b>Startdatum ist heute</b>, danach wieder{" "}
            <b>Summe</b>.
          </li>
          <li>
            Aktion <b>„Text“</b> mit Inhalt: <code>Schritte: [Summe 1]; Kalorien: [Summe 2]</code> (die Variablen über die Leiste
            über der Tastatur einsetzen).
          </li>
          <li>
            Aktion <b>„In Zwischenablage kopieren“</b>.
          </li>
          <li>
            Fertig. Beim ersten Ausführen fragt das iPhone nach Health-Zugriff, bitte erlauben.
          </li>
        </ol>
        <p className="small muted">
          Nutzung: Im Tagebuch bei Health auf <b>Holen</b> tippen. Der Kurzbefehl läuft, danach zurück zur App wechseln und{" "}
          <b>Einfügen</b> tippen.
        </p>
      </details>
    </div>
  );
}

// ---------- Backup ----------

function BackupCard({ settings }: { settings: S }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, []);

  return (
    <div className="card stack">
      <h2>💾 Backup</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Alle Daten liegen nur auf diesem iPhone. Sichere sie regelmäßig, z. B. in iCloud Drive über „In Dateien sichern“.
        {settings.lastBackupAt && <> Letztes Backup: {new Date(settings.lastBackupAt).toLocaleDateString("de-DE")}.</>}
      </p>
      <button
        className="btn primary block"
        onClick={async () => {
          try {
            await shareOrDownloadBackup();
          } catch (e) {
            setMsg({ ok: false, text: (e as Error).message });
          }
        }}
      >
        Backup erstellen
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (!confirm("Backup wiederherstellen? Alle aktuellen Daten in der App werden dabei ersetzt.")) return;
          try {
            await importBackup(f);
            setMsg({ ok: true, text: "Backup wiederhergestellt ✓" });
          } catch (err) {
            setMsg({ ok: false, text: (err as Error).message });
          }
        }}
      />
      <button className="btn block" onClick={() => fileRef.current?.click()}>
        Backup wiederherstellen
      </button>
      {msg && <div className={`notice small${msg.ok ? "" : " error"}`}>{msg.text}</div>}
      {persisted === false && (
        <button
          className="btn small"
          onClick={async () => setPersisted((await navigator.storage?.persist?.()) ?? false)}
        >
          Dauerhaften Speicher anfordern
        </button>
      )}
    </div>
  );
}
