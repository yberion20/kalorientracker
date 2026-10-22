import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { AmountSheet } from "../components/AmountSheet";
import { FoodThumb, NutriGrid, Sheet } from "../components/ui";
import { type SavedMeal, type SavedMealItem, db, uid } from "../db";
import { fmt } from "../lib/nutrition";
import { AddFood, mealTotal } from "./AddFood";

export function SavedMeals({ goToSettings }: { goToSettings: () => void }) {
  const meals = useLiveQuery(() => db.savedMeals.orderBy("name").toArray(), []);
  const [editing, setEditing] = useState<SavedMeal | null>(null);

  return (
    <div>
      <div className="row between">
        <h1>Mahlzeiten</h1>
        <button
          className="btn small primary"
          onClick={() => setEditing({ id: "", name: "", items: [], updatedAt: 0 })}
        >
          + Neu
        </button>
      </div>
      <p className="muted small" style={{ marginTop: -4 }}>
        Gespeicherte Kombinationen aus mehreren Lebensmitteln. Im Tagebuch über ＋ › Mahlzeiten mit einem Tipp hinzufügen.
      </p>
      {meals && meals.length === 0 && (
        <div className="card empty">
          Noch keine Mahlzeiten.
          <br />
          <span className="small">Tipp: Im Tagebuch bei Frühstück &amp; Co. auf „Als Mahlzeit speichern“ tippen.</span>
        </div>
      )}
      {meals && meals.length > 0 && (
        <div className="list">
          {meals.map((m) => {
            const t = mealTotal(m);
            return (
              <button key={m.id} className="list-item" onClick={() => setEditing(m)}>
                <div className="thumb">🍱</div>
                <div className="grow">
                  <div style={{ fontWeight: 600 }} className="ellipsis">
                    {m.name}
                  </div>
                  <div className="small muted ellipsis">
                    {m.items.map((i) => i.food.name).join(", ")}
                  </div>
                </div>
                <div className="small" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <b>{fmt(t.kcal)}</b> kcal
                </div>
              </button>
            );
          })}
        </div>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Mahlzeit bearbeiten" : "Neue Mahlzeit"} full>
        {editing && <MealEditor key={editing.id || "new"} meal={editing} onDone={() => setEditing(null)} goToSettings={goToSettings} />}
      </Sheet>
    </div>
  );
}

function MealEditor({ meal, onDone, goToSettings }: { meal: SavedMeal; onDone: () => void; goToSettings: () => void }) {
  const [name, setName] = useState(meal.name);
  const [items, setItems] = useState<SavedMealItem[]>(meal.items);
  const [adding, setAdding] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const total = mealTotal({ ...meal, items });

  const save = async () => {
    const data = { id: meal.id || uid(), name: name.trim(), items, updatedAt: Date.now() };
    await db.savedMeals.put(data);
    onDone();
  };

  return (
    <div className="stack">
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Mein Müsli" />
      </label>

      <div className="section-title" style={{ marginBottom: 0 }}>
        Zutaten
      </div>
      {items.length === 0 ? (
        <div className="empty small">Noch keine Lebensmittel.</div>
      ) : (
        <div className="list">
          {items.map((it, i) => (
            <button key={i} className="list-item" onClick={() => setEditIdx(i)}>
              <FoodThumb imageUrl={it.food.imageUrl} source={it.food.source} />
              <div className="grow">
                <div className="ellipsis">{it.food.name}</div>
                <div className="small muted">
                  {fmt(it.amount)} {it.food.unit} · {fmt((it.food.per100.kcal * it.amount) / 100)} kcal
                </div>
              </div>
              <span className="muted">›</span>
            </button>
          ))}
        </div>
      )}
      <button className="btn block" onClick={() => setAdding(true)}>
        + Lebensmittel hinzufügen
      </button>

      {items.length > 0 && <NutriGrid n={total} />}

      <button className="btn primary block" disabled={!name.trim() || !items.length} onClick={save}>
        Speichern
      </button>
      {meal.id && (
        <button
          className="btn danger block"
          onClick={async () => {
            if (confirm(`„${meal.name}“ wirklich löschen?`)) {
              await db.savedMeals.delete(meal.id);
              onDone();
            }
          }}
        >
          Mahlzeit löschen
        </button>
      )}

      <AddFood
        open={adding}
        title="Zutat hinzufügen"
        withSavedMeals={false}
        onClose={() => setAdding(false)}
        goToSettings={goToSettings}
        onAdd={(newItems) => setItems((prev) => [...prev, ...newItems])}
      />
      <AmountSheet
        food={editIdx !== null ? items[editIdx].food : null}
        initialAmount={editIdx !== null ? items[editIdx].amount : undefined}
        confirmLabel="Übernehmen"
        onClose={() => setEditIdx(null)}
        onConfirm={(amount) => {
          setItems((prev) => prev.map((it, i) => (i === editIdx ? { ...it, amount } : it)));
          setEditIdx(null);
        }}
        onDelete={() => {
          setItems((prev) => prev.filter((_, i) => i !== editIdx));
          setEditIdx(null);
        }}
      />
    </div>
  );
}
