import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, foodKey, setFavorite } from "../db";
import { type FoodSnapshot, type Meal, MEALS, fmt, scale } from "../lib/nutrition";
import { FoodThumb, NumberInput, NutriGrid, Sheet } from "./ui";

export interface AmountSheetProps {
  food: FoodSnapshot | null;
  initialAmount?: number;
  confirmLabel?: string;
  meal?: Meal;
  onMealChange?: (m: Meal) => void;
  onConfirm: (amount: number) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function defaultAmount(food: FoodSnapshot) {
  return food.servingSize ?? 100;
}

export function AmountSheet(props: AmountSheetProps) {
  const { food } = props;
  return (
    <Sheet open={!!food} onClose={props.onClose} title={food?.name}>
      {food && <AmountBody key={`${food.name}|${food.ean}|${props.initialAmount}`} {...props} food={food} />}
    </Sheet>
  );
}

function AmountBody({
  food,
  initialAmount,
  confirmLabel = "Hinzufügen",
  meal,
  onMealChange,
  onConfirm,
  onDelete,
}: AmountSheetProps & { food: FoodSnapshot }) {
  const [amount, setAmount] = useState<number | "">(initialAmount ?? defaultAmount(food));
  const fav = useLiveQuery(async () => (await db.foods.get(foodKey(food)))?.favorite === 1, [food]);
  const n = scale(food.per100, amount || 0);
  const u = food.unit;
  const presets = Array.from(
    new Set([food.servingSize, 50, 100, 150, 200, 250].filter((x): x is number => !!x && x > 0).map((x) => Math.round(x))),
  ).slice(0, 5);

  return (
    <div className="stack">
      <div className="row">
        <FoodThumb imageUrl={food.imageUrl} source={food.source} />
        <div className="grow">
          <div className="muted small ellipsis">{food.brand || sourceLabel(food.source)}</div>
          <div className="small muted">
            {fmt(food.per100.kcal)} kcal pro 100 {u}
            {food.servingLabel ? ` · Portion: ${food.servingLabel}` : ""}
          </div>
        </div>
        {food.source !== "quick" && (
          <button
            className="icon-btn plain"
            aria-label="Favorit"
            onClick={() => setFavorite(food, !fav)}
            style={{ fontSize: 24, color: fav ? "#f5b301" : "var(--muted)" }}
          >
            {fav ? "★" : "☆"}
          </button>
        )}
      </div>

      {food.source !== "quick" && (
      <>
      <label className="field">
        <span>Menge in {u}</span>
        <div className="row">
          <NumberInput value={amount} onChange={setAmount} autoFocus />
          <span className="muted" style={{ width: 28 }}>
            {u}
          </span>
        </div>
      </label>

      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {food.servingSize && (
          <>
            <button className="chip" onClick={() => setAmount(food.servingSize! / 2)}>
              ½ Portion
            </button>
            <button className="chip" onClick={() => setAmount(food.servingSize!)}>
              1 Portion ({fmt(food.servingSize)} {u})
            </button>
            <button className="chip" onClick={() => setAmount(food.servingSize! * 2)}>
              2 Portionen
            </button>
          </>
        )}
        {presets
          .filter((p) => p !== food.servingSize)
          .map((p) => (
            <button key={p} className={`chip${amount === p ? " active" : ""}`} onClick={() => setAmount(p)}>
              {p} {u}
            </button>
          ))}
      </div>
      </>
      )}

      <NutriGrid n={n} />

      {meal && onMealChange && (
        <div className="segment">
          {MEALS.map((m) => (
            <button key={m.id} className={meal === m.id ? "active" : ""} onClick={() => onMealChange(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      <button className="btn primary block" disabled={!amount} onClick={() => amount && onConfirm(amount)}>
        {confirmLabel}
      </button>
      {onDelete && (
        <button className="btn danger block" onClick={onDelete}>
          Eintrag löschen
        </button>
      )}
    </div>
  );
}

export function sourceLabel(s: FoodSnapshot["source"]) {
  return { off: "Open Food Facts", custom: "Eigenes Lebensmittel", ai: "KI-Schätzung", quick: "Schnell-Eintrag" }[s];
}
