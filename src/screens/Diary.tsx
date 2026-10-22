import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { AmountSheet } from "../components/AmountSheet";
import { FoodThumb, MacroBars, Ring, Sheet } from "../components/ui";
import { type Entry, addEntry, copyMeal, db, getSettings, uid, updateEntry } from "../db";
import { parseHealthText, shortcutUrl } from "../lib/health";
import { MEALS, type Meal, addDays, fmt, formatDayLabel, sum, todayISO } from "../lib/nutrition";
import { AddFood } from "./AddFood";

export function Diary({
  date,
  setDate,
  goToSettings,
}: {
  date: string;
  setDate: (d: string) => void;
  goToSettings: () => void;
}) {
  const settings = useLiveQuery(getSettings);
  const entries = useLiveQuery(() => db.entries.where("date").equals(date).sortBy("createdAt"), [date]);
  const water = useLiveQuery(() => db.water.get(date), [date]);
  const health = useLiveQuery(() => db.health.get(date), [date]);
  const firstEntry = useLiveQuery(() => db.entries.orderBy("createdAt").first(), []);

  const [addFor, setAddFor] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [editMeal, setEditMeal] = useState<Meal>("breakfast");
  const [saveMealOf, setSaveMealOf] = useState<Meal | null>(null);
  const [mealName, setMealName] = useState("");
  const [healthMsg, setHealthMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!settings || !entries) return null;

  const goals = settings.goals;
  const total = sum(entries.map((e) => e.nutrients));
  const burned = settings.addActiveKcalToBudget ? (health?.activeKcal ?? 0) : 0;
  const budget = goals.kcal + burned;
  const remaining = budget - total.kcal;
  const byMeal = (m: Meal) => entries.filter((e) => e.meal === m);
  // Erst erinnern, wenn die App seit einer Woche genutzt wird und das letzte Backup >14 Tage her ist.
  const usedForAWeek = !!firstEntry && Date.now() - firstEntry.createdAt > 7 * 86400_000;
  const backupDue = usedForAWeek && (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > 14 * 86400_000);

  const setWater = (ml: number) => db.water.put({ date, ml: Math.max(0, ml) });

  const pasteHealth = async () => {
    setHealthMsg(null);
    try {
      const text = await navigator.clipboard.readText();
      const h = parseHealthText(text);
      if (!h) {
        setHealthMsg("In der Zwischenablage sind keine Health-Daten. Bitte zuerst den Kurzbefehl ausführen.");
        return;
      }
      const target = h.date ?? date;
      await db.health.put({ date: target, steps: h.steps, activeKcal: h.activeKcal, importedAt: Date.now() });
      setHealthMsg(target === date ? "Übernommen ✓" : `Für ${formatDayLabel(target)} übernommen ✓`);
    } catch {
      setHealthMsg("Kein Zugriff auf die Zwischenablage. Bitte „Einfügen“ bestätigen.");
    }
  };

  return (
    <div>
      <div className="datebar">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Vorheriger Tag">
          ‹
        </button>
        <div className="label">
          {formatDayLabel(date)}
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Nächster Tag">
          ›
        </button>
      </div>
      {date !== todayISO() && (
        <div style={{ textAlign: "center", marginTop: -6, marginBottom: 10 }}>
          <button className="chip" onClick={() => setDate(todayISO())}>
            Zu heute
          </button>
        </div>
      )}

      {backupDue && (
        <div className="notice warn" style={{ marginBottom: 12 }} onClick={goToSettings}>
          💾 Deine Daten liegen nur auf diesem iPhone. Sichere sie ab und zu in den Einstellungen (Backup).
        </div>
      )}

      <div className="card">
        <div className="summary">
          <div>
            <div className="num">{fmt(total.kcal)}</div>
            <div className="small muted">gegessen</div>
          </div>
          <div className="ring-wrap">
            <Ring value={total.kcal} max={budget} />
            <div className="ring-center">
              <div className="big" style={{ color: remaining < 0 ? "var(--danger)" : undefined }}>
                {fmt(Math.abs(remaining))}
              </div>
              <div className="small muted">{remaining < 0 ? "kcal zu viel" : "kcal übrig"}</div>
            </div>
          </div>
          <div>
            <div className="num">{fmt(health?.activeKcal ?? 0)}</div>
            <div className="small muted">verbrannt</div>
          </div>
        </div>
        <MacroBars total={total} goals={goals} />
      </div>

      {MEALS.map((m) => {
        const list = byMeal(m.id);
        const mt = sum(list.map((e) => e.nutrients));
        return (
          <div className="card" key={m.id}>
            <div className="meal-head">
              <div className="meal-icon">{m.icon}</div>
              <div className="grow">
                <h2>{m.label}</h2>
                <div className="small muted">
                  {list.length
                    ? `${fmt(mt.kcal)} kcal · KH ${fmt(mt.carbs)} · E ${fmt(mt.protein)} · F ${fmt(mt.fat)} g`
                    : "Noch nichts eingetragen"}
                </div>
              </div>
              <button className="add-btn" onClick={() => setAddFor(m.id)} aria-label={`${m.label} hinzufügen`}>
                +
              </button>
            </div>
            {list.length > 0 && (
              <div className="entries">
                {list.map((e) => (
                  <button
                    className="entry"
                    key={e.id}
                    onClick={() => {
                      setEditMeal(e.meal);
                      setEditing(e);
                    }}
                  >
                    <FoodThumb imageUrl={e.food.imageUrl} source={e.food.source} />
                    <div className="grow">
                      <div className="ellipsis">{e.food.name}</div>
                      <div className="small muted ellipsis">
                        {e.food.source === "quick" ? "Schnell-Eintrag" : `${fmt(e.amount)} ${e.food.unit}`}
                        {e.food.brand ? ` · ${e.food.brand}` : ""}
                      </div>
                    </div>
                    <span className="kcal">{fmt(e.nutrients.kcal)} kcal</span>
                  </button>
                ))}
              </div>
            )}
            <div className="meal-actions">
              {list.length > 0 && (
                <button
                  className="chip"
                  onClick={() => {
                    setMealName("");
                    setSaveMealOf(m.id);
                  }}
                >
                  🍱 Als Mahlzeit speichern
                </button>
              )}
              <button
                className="chip"
                onClick={async () => {
                  const n = await copyMeal(addDays(date, -1), date, m.id);
                  setNotice(n ? `${n} Einträge von gestern kopiert` : `Gestern gab es kein ${m.label}`);
                  setTimeout(() => setNotice(null), 2200);
                }}
              >
                ↻ Von gestern
              </button>
            </div>
          </div>
        );
      })}

      <div className="tiles">
        <div className="card">
          <div className="row between">
            <h3>💧 Wasser</h3>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
            {fmt((water?.ml ?? 0) / 1000, 2)} <span className="small muted">/ {fmt(goals.waterMl / 1000, 1)} l</span>
          </div>
          <div className="water-glasses">
            {Array.from({ length: Math.max(8, Math.ceil(goals.waterMl / 250)) }).map((_, i) => (
              <span key={i} className={i < Math.floor((water?.ml ?? 0) / 250) ? "full" : ""} />
            ))}
          </div>
          <div className="row">
            <button className="btn small" onClick={() => setWater((water?.ml ?? 0) - 250)}>
              −
            </button>
            <button className="btn small primary grow" onClick={() => setWater((water?.ml ?? 0) + 250)}>
              + 250 ml
            </button>
          </div>
        </div>
        <div className="card">
          <h3>❤️ Health</h3>
          <div style={{ marginTop: 6 }}>
            <div>
              <b style={{ fontSize: 20 }}>{fmt(health?.steps ?? 0)}</b> <span className="small muted">Schritte</span>
            </div>
            <div>
              <b style={{ fontSize: 20 }}>{fmt(health?.activeKcal ?? 0)}</b> <span className="small muted">aktive kcal</span>
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <a className="btn small grow" href={shortcutUrl()} style={{ textDecoration: "none" }}>
              Holen
            </a>
            <button className="btn small primary grow" onClick={pasteHealth}>
              Einfügen
            </button>
          </div>
          {healthMsg && <div className="small muted" style={{ marginTop: 6 }}>{healthMsg}</div>}
        </div>
      </div>

      {notice && (
        <div className="update-banner" style={{ zIndex: 35 }}>
          {notice}
        </div>
      )}

      <AddFood
        open={!!addFor}
        title={MEALS.find((x) => x.id === addFor)?.label ?? ""}
        onClose={() => setAddFor(null)}
        goToSettings={() => {
          setAddFor(null);
          goToSettings();
        }}
        onAdd={async (items) => {
          for (const it of items) await addEntry(date, addFor!, it.food, it.amount);
        }}
      />

      <AmountSheet
        food={editing?.food ?? null}
        initialAmount={editing?.amount}
        confirmLabel="Speichern"
        meal={editMeal}
        onMealChange={setEditMeal}
        onClose={() => setEditing(null)}
        onConfirm={async (amount) => {
          await updateEntry(editing!.id, { amount, meal: editMeal });
          setEditing(null);
        }}
        onDelete={async () => {
          await db.entries.delete(editing!.id);
          setEditing(null);
        }}
      />

      <Sheet open={!!saveMealOf} onClose={() => setSaveMealOf(null)} title="Als Mahlzeit speichern">
        {saveMealOf && (
          <div className="stack">
            <p className="muted small" style={{ margin: 0 }}>
              Speichert alle {byMeal(saveMealOf).length} Einträge von {MEALS.find((x) => x.id === saveMealOf)?.label} mit ihren
              Mengen. Später fügst du sie mit einem Tipp wieder hinzu.
            </p>
            <input
              className="input"
              autoFocus
              placeholder="Name, z. B. „Mein Porridge“"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
            />
            <button
              className="btn primary block"
              disabled={!mealName.trim()}
              onClick={async () => {
                await db.savedMeals.add({
                  id: uid(),
                  name: mealName.trim(),
                  items: byMeal(saveMealOf).map((e) => ({ food: e.food, amount: e.amount })),
                  updatedAt: Date.now(),
                });
                setSaveMealOf(null);
                setNotice(`„${mealName.trim()}“ gespeichert`);
                setTimeout(() => setNotice(null), 2200);
              }}
            >
              Speichern
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
