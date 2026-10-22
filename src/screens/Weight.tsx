import {
  CategoryScale,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { NumberInput, Sheet } from "../components/ui";
import { type Weight as W, db, getSettings } from "../db";
import { addDays, fmt, todayISO } from "../lib/nutrition";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

const RANGES = [
  { id: 7, label: "7 T" },
  { id: 30, label: "30 T" },
  { id: 90, label: "90 T" },
  { id: 365, label: "1 J" },
  { id: 0, label: "Alles" },
];

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.`;
};

export function Weight() {
  const weights = useLiveQuery(() => db.weights.orderBy("date").toArray(), []);
  const settings = useLiveQuery(getSettings);
  const [range, setRange] = useState(30);
  const [editing, setEditing] = useState<W | null>(null);

  const visible = useMemo(() => {
    if (!weights) return [];
    if (!range) return weights;
    const from = addDays(todayISO(), -range + 1);
    return weights.filter((w) => w.date >= from);
  }, [weights, range]);

  if (!weights || !settings) return null;
  const latest = weights[weights.length - 1];
  const first = weights[0];
  const target = settings.profile?.targetWeightKg;

  return (
    <div>
      <div className="row between">
        <h1>Gewicht</h1>
        <button className="btn small primary" onClick={() => setEditing({ date: todayISO(), kg: latest?.kg ?? 75 })}>
          + Eintragen
        </button>
      </div>

      <div className="card">
        <div className="grid4" style={{ gridTemplateColumns: target ? "repeat(3, 1fr)" : "repeat(2, 1fr)", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{latest ? fmt(latest.kg, 1) : "–"}</div>
            <div className="small muted">aktuell (kg)</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>
              {latest && first ? `${latest.kg - first.kg > 0 ? "+" : ""}${fmt(latest.kg - first.kg, 1)}` : "–"}
            </div>
            <div className="small muted">seit Start</div>
          </div>
          {target && (
            <div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{latest ? fmt(Math.abs(latest.kg - target), 1) : "–"}</div>
              <div className="small muted">bis Ziel ({fmt(target, 1)})</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="segment" style={{ marginBottom: 12 }}>
          {RANGES.map((r) => (
            <button key={r.id} className={range === r.id ? "active" : ""} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        {visible.length < 2 ? (
          <div className="empty small">Mindestens zwei Einträge im Zeitraum für das Diagramm.</div>
        ) : (
          <WeightChart data={visible} target={target} />
        )}
      </div>

      <div className="section-title">Verlauf</div>
      {weights.length === 0 ? (
        <div className="card empty">Noch keine Einträge.</div>
      ) : (
        <div className="list">
          {[...weights].reverse().map((w, i, arr) => {
            const prev = arr[i + 1];
            const diff = prev ? w.kg - prev.kg : 0;
            return (
              <button key={w.date} className="list-item" onClick={() => setEditing(w)}>
                <div className="grow">
                  {new Date(w.date + "T12:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </div>
                {prev && (
                  <span className="small" style={{ color: diff > 0 ? "var(--danger)" : diff < 0 ? "var(--accent)" : "var(--muted)" }}>
                    {diff > 0 ? "▲" : diff < 0 ? "▼" : "•"} {fmt(Math.abs(diff), 1)}
                  </span>
                )}
                <b style={{ width: 70, textAlign: "right" }}>{fmt(w.kg, 1)} kg</b>
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Gewicht">
        {editing && <WeightForm initial={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function WeightForm({ initial, onDone }: { initial: W; onDone: () => void }) {
  const [date, setDate] = useState(initial.date);
  const [kg, setKg] = useState<number | "">(initial.kg);
  const exists = useLiveQuery(() => db.weights.get(initial.date), [initial.date]);
  return (
    <div className="stack">
      <label className="field">
        <span>Datum</span>
        <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>Gewicht (kg)</span>
        <NumberInput value={kg} onChange={setKg} autoFocus />
      </label>
      <button
        className="btn primary block"
        disabled={!kg || !date}
        onClick={async () => {
          if (exists && date !== initial.date) await db.weights.delete(initial.date);
          await db.weights.put({ date, kg: kg as number });
          onDone();
        }}
      >
        Speichern
      </button>
      {exists && (
        <button
          className="btn danger block"
          onClick={async () => {
            await db.weights.delete(initial.date);
            onDone();
          }}
        >
          Löschen
        </button>
      )}
    </div>
  );
}

function WeightChart({ data, target }: { data: W[]; target?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim();
    const muted = css.getPropertyValue("--muted").trim();
    const line = css.getPropertyValue("--line").trim();
    // Gleitender 7-Tage-Durchschnitt (über Kalendertage, nicht Einträge).
    const avg = data.map((w) => {
      const from = addDays(w.date, -6);
      const win = data.filter((x) => x.date >= from && x.date <= w.date);
      return win.reduce((s, x) => s + x.kg, 0) / win.length;
    });
    const datasets = [
      {
        label: "Gewicht",
        data: data.map((w) => w.kg),
        borderColor: accent,
        backgroundColor: accent + "22",
        pointRadius: data.length > 60 ? 0 : 3,
        pointBackgroundColor: accent,
        borderWidth: 2,
        tension: 0.25,
        fill: true,
      },
      {
        label: "Ø 7 Tage",
        data: avg,
        borderColor: muted,
        borderDash: [4, 4],
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0.3,
        fill: false,
      },
      ...(target
        ? [
            {
              label: "Ziel",
              data: data.map(() => target),
              borderColor: "#f59e0b",
              borderDash: [2, 3],
              pointRadius: 0,
              borderWidth: 1,
              fill: false,
            },
          ]
        : []),
    ];
    const chart = new Chart(ref.current!, {
      type: "line",
      data: { labels: data.map((w) => shortDate(w.date)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y ?? 0, 1)} kg` },
          },
        },
        scales: {
          x: { ticks: { color: muted, maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: muted, callback: (v) => fmt(Number(v), 1) }, grid: { color: line } },
        },
      },
    });
    return () => chart.destroy();
  }, [data, target]);
  return (
    <div className="chart-box">
      <canvas ref={ref} />
    </div>
  );
}
