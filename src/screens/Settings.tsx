import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { Toggle } from "../components/ui";
import { WheelField } from "../components/Wheel";
import { type Settings as S, db, getSettings, saveSettings } from "../db";
import { AI_MODELS, testKey } from "../lib/ai";
import { importBackup, shareOrDownloadBackup } from "../lib/backup";
import { SHORTCUT_NAME } from "../lib/health";
import {
  ACTIVITY,
  type DayAdjust,
  FASTING_PRESETS,
  type Fasting,
  WEEKDAYS,
  dayFactor,
  eatWindowMinutes,
  formatDuration,
  fromMin,
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
      <DayGoalsCard settings={settings} />
      <FastingCard settings={settings} />
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
  const [kcal, setKcal] = useState<number>(settings.goals.kcal);
  const [water, setWater] = useState<number>(settings.goals.waterMl / 1000);
  const [saved, setSaved] = useState(false);

  const suggested = calorieTarget(p);
  const grams = macroGrams(kcal || 0, split);
  const splitSum = split.protein + split.carbs + split.fat;

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));

  const save = async () => {
    await saveSettings({
      profile: p,
      split,
      goals: { kcal, ...grams, waterMl: Math.round(water * 1000) },
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
        <WheelField label="Alter" value={p.age} onChange={(v) => set("age", v ?? p.age)} min={14} max={100} unit="Jahre" />
        <WheelField label="Größe" value={p.heightCm} onChange={(v) => set("heightCm", v ?? p.heightCm)} min={120} max={230} unit="cm" />
        <WheelField
          label="Gewicht"
          value={p.weightKg}
          onChange={(v) => set("weightKg", v ?? p.weightKg)}
          min={30}
          max={250}
          step={0.1}
          unit="kg"
        />
        <WheelField
          label="Zielgewicht"
          value={p.targetWeightKg}
          onChange={(v) => set("targetWeightKg", v)}
          defaultValue={Math.round(p.weightKg - (p.goal === "gain" ? -5 : 5))}
          optional
          min={30}
          max={250}
          step={0.1}
          unit="kg"
        />
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
        <WheelField
          label="Kalorienziel"
          value={kcal}
          onChange={(v) => setKcal(v ?? kcal)}
          defaultValue={suggested}
          min={1000}
          max={5000}
          step={10}
          unit="kcal"
        />
        <WheelField label="Wasserziel" value={water} onChange={(v) => setWater(v ?? water)} min={0.5} max={6} step={0.25} unit="l" />
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
          <div key={k}>
            <WheelField
              label={`${l} %`}
              value={split[k]}
              onChange={(v) => setSplit((s) => ({ ...s, [k]: v ?? s[k] }))}
              format={(v) => `${v} %`}
              min={0}
              max={80}
              unit="%"
            />
            <span className="small muted" style={{ display: "block", marginTop: 4, color: c }}>
              = {grams[k]} g
            </span>
          </div>
        ))}
      </div>
      {splitSum !== 100 && <div className="notice warn small">Die Summe ist {splitSum} % – sie sollte 100 % ergeben.</div>}
      <button className="btn primary block" onClick={save} disabled={splitSum !== 100}>
        {saved ? "Gespeichert ✓" : "Ziele speichern"}
      </button>
    </div>
  );
}

// ---------- Abweichende Tagesziele ----------

function DayGoalsCard({ settings }: { settings: S }) {
  const adj = settings.dayAdjust;
  const set = (patch: Partial<DayAdjust>) => saveSettings({ dayAdjust: { ...adj, ...patch } });
  const toggleDay = (d: number) =>
    set({ days: adj.days.includes(d) ? adj.days.filter((x) => x !== d) : [...adj.days, d].sort() });
  const base = settings.goals.kcal;
  const otherFactor = dayFactor(adj, [0, 1, 2, 3, 4, 5, 6].find((d) => !adj.days.includes(d)) ?? 1);
  const tooMany = adj.days.length === 7;

  return (
    <div className="card stack">
      <div className="row between">
        <h2>📅 Abweichende Tage</h2>
        <Toggle checked={adj.enabled} onChange={(v) => set({ enabled: v })} />
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Z. B. am Wochenende mehr essen: An den gewählten Tagen gilt ein höheres (oder niedrigeres) Kalorienziel.
      </p>
      {adj.enabled && (
        <>
          <div className="weekday-picker">
            {WEEKDAYS.map((d) => (
              <button key={d.id} className={adj.days.includes(d.id) ? "active" : ""} onClick={() => toggleDay(d.id)}>
                {d.short}
              </button>
            ))}
          </div>
          {tooMany && <div className="notice warn small">Bei allen 7 Tagen gibt es keine Abweichung – dann einfach das Grundziel ändern.</div>}
          <WheelField
            label="Abweichung an diesen Tagen"
            value={adj.percent}
            onChange={(v) => v !== undefined && set({ percent: v })}
            format={(v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} %`}
            min={-50}
            max={100}
            step={5}
            unit="%"
          />
          <div className="row between">
            <div className="grow small">
              Woche ausgleichen
              <div className="muted">Die übrigen Tage werden so angepasst, dass die Wochensumme gleich bleibt.</div>
            </div>
            <Toggle checked={adj.balance} onChange={(v) => set({ balance: v })} />
          </div>
          {!tooMany && adj.days.length > 0 && (
            <div className="week-preview">
              {WEEKDAYS.map((d) => {
                const kcal = Math.round((base * dayFactor(adj, d.id)) / 10) * 10;
                return (
                  <div key={d.id} className={adj.days.includes(d.id) ? "special" : ""}>
                    <span>{d.short}</span>
                    <b>{fmt(kcal)}</b>
                  </div>
                );
              })}
            </div>
          )}
          {adj.balance && otherFactor < 0.8 && (
            <div className="notice warn small">
              Die übrigen Tage liegen dann {fmt((1 - otherFactor) * 100)} % unter dem Grundziel. Vielleicht eine kleinere Abweichung wählen.
            </div>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            Grundziel: {fmt(base)} kcal. Eiweiß, Kohlenhydrate und Fett ändern sich im selben Verhältnis.
          </p>
        </>
      )}
    </div>
  );
}

// ---------- Intervallfasten ----------

function FastingCard({ settings }: { settings: S }) {
  const f = settings.fasting;
  const set = (patch: Partial<Fasting>) => saveSettings({ fasting: { ...f, ...patch } });
  const eat = eatWindowMinutes(f);
  const activePreset = FASTING_PRESETS.find((p) => p.eatHours * 60 === eat)?.label;

  return (
    <div className="card stack">
      <div className="row between">
        <h2>⏱️ Intervallfasten</h2>
        <Toggle checked={f.enabled} onChange={(v) => set({ enabled: v })} />
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Lege fest, wann du isst. Im Tagebuch siehst du dann, ob gerade Essenszeit oder Fastenzeit ist und wie lange noch.
      </p>
      {f.enabled && (
        <>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {FASTING_PRESETS.map((p) => (
              <button
                key={p.label}
                className={`chip${activePreset === p.label ? " active" : ""}`}
                onClick={() => set({ eatEnd: fromMin(Number(f.eatStart.slice(0, 2)) * 60 + Number(f.eatStart.slice(3)) + p.eatHours * 60) })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid2">
            <label className="field">
              <span>Essen ab</span>
              <input className="input" type="time" value={f.eatStart} onChange={(e) => e.target.value && set({ eatStart: e.target.value })} />
            </label>
            <label className="field">
              <span>Essen bis</span>
              <input className="input" type="time" value={f.eatEnd} onChange={(e) => e.target.value && set({ eatEnd: e.target.value })} />
            </label>
          </div>
          <div className="notice small">
            🍽️ Essensfenster {formatDuration(eat).replace(" 00 min", "")} · 🌙 Fasten {formatDuration(1440 - eat).replace(" 00 min", "")}
            <br />
            Fasten von {f.eatEnd} bis {f.eatStart} Uhr.
          </div>
        </>
      )}
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
