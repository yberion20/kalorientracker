import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { addPortions, db, foodKey, getSettings, setFavorite } from "../db";
import { estimatePortions } from "../lib/ai";
import {
  type FoodSnapshot,
  type Meal,
  MEALS,
  type Portion,
  type Selection,
  allPortions,
  fmt,
  fmtCount,
  formatAmount,
  scale,
} from "../lib/nutrition";
import { FoodThumb, NumberInput, NutriGrid, Sheet } from "./ui";

export interface AmountSheetProps {
  food: FoodSnapshot | null;
  /** Vorauswahl, z. B. beim Bearbeiten eines Eintrags */
  initial?: Selection;
  confirmLabel?: string;
  meal?: Meal;
  onMealChange?: (m: Meal) => void;
  onConfirm: (sel: Selection) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** Startmenge ohne gespeicherte Vorliebe: erste Portion, sonst 100 g. */
export function defaultSelection(food: FoodSnapshot, extra: Portion[] = []): Selection {
  const p = allPortions(food, extra)[0];
  return p ? { amount: p.amount, portion: { label: p.label, size: p.amount, count: 1 } } : { amount: 100 };
}

export function AmountSheet(props: AmountSheetProps) {
  const { food } = props;
  return (
    <Sheet open={!!food} onClose={props.onClose} title={food?.name}>
      {food && <AmountLoader key={`${food.name}|${food.ean}|${props.initial?.amount}`} {...props} food={food} />}
    </Sheet>
  );
}

function AmountLoader(props: AmountSheetProps & { food: FoodSnapshot }) {
  // null = nicht im eigenen Katalog, undefined = lädt noch
  const record = useLiveQuery(async () => (await db.foods.get(foodKey(props.food))) ?? null, [props.food]);
  if (record === undefined) return null;
  return <AmountBody {...props} record={record} />;
}

const sameSelection = (a?: Selection, b?: Selection) =>
  !!a && !!b && Math.abs(a.amount - b.amount) < 0.01 && (a.portion?.label ?? "") === (b.portion?.label ?? "");

function AmountBody({
  food,
  record,
  initial,
  confirmLabel = "Hinzufügen",
  meal,
  onMealChange,
  onConfirm,
  onDelete,
}: AmountSheetProps & { food: FoodSnapshot; record: import("../db").Food | null }) {
  const settings = useLiveQuery(getSettings);
  const u = food.unit;
  const [portions, setPortions] = useState<Portion[]>(() => {
    const list = allPortions(food, record?.portions);
    // Beim Bearbeiten: gewählte Portion auch anzeigen, wenn sie nicht (mehr) in der Liste steht.
    const p = initial?.portion;
    if (p && !list.some((x) => x.label === p.label)) list.unshift({ label: p.label, amount: p.size });
    return list;
  });
  const start = initial ?? record?.preferred ?? record?.lastSelection ?? defaultSelection(food, record?.portions);
  const startPortion = start.portion ? portions.find((p) => p.label === start.portion!.label) : undefined;
  const [unitLabel, setUnitLabel] = useState<string | null>(startPortion ? startPortion.label : null);
  const [value, setValue] = useState<number | "">(startPortion ? start.portion!.count : Math.round(start.amount * 10) / 10);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState<number | "">("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const fav = record?.favorite === 1;
  const unit = unitLabel ? portions.find((p) => p.label === unitLabel) : undefined;
  const grams = unit ? (value || 0) * unit.amount : value || 0;
  const selection: Selection = unit
    ? { amount: grams, portion: { label: unit.label, size: unit.amount, count: value || 0 } }
    : { amount: grams };
  const n = scale(food.per100, grams);

  const chooseUnit = (label: string | null) => {
    if (label === unitLabel) return;
    const next = label ? portions.find((p) => p.label === label) : undefined;
    // Menge möglichst beibehalten: von g auf Portion → Anzahl 1, von Portion auf g → Gramm übernehmen.
    if (next) setValue(1);
    else setValue(Math.round(grams * 10) / 10 || 100);
    setUnitLabel(label);
  };

  const savePortion = async (list: Portion[]) => {
    await addPortions(food, list);
    const merged = allPortions({ portions: [...portions, ...list] });
    setPortions(merged);
    setUnitLabel(list[0].label);
    setValue(1);
  };

  const quick = unit ? [0.5, 1, 1.5, 2, 3] : [50, 100, 150, 200, 250];

  return (
    <div className="stack">
      <div className="row">
        <FoodThumb imageUrl={food.imageUrl} source={food.source} />
        <div className="grow">
          <div className="muted small ellipsis">{food.brand || sourceLabel(food.source)}</div>
          <div className="small muted">
            {fmt(food.per100.kcal)} kcal pro 100 {u}
          </div>
        </div>
        {food.source !== "quick" && (
          <button
            className="icon-btn plain"
            aria-label="Favorit"
            onClick={() => setFavorite(food, !fav, selection)}
            style={{ fontSize: 24, color: fav ? "#f5b301" : "var(--muted)" }}
          >
            {fav ? "★" : "☆"}
          </button>
        )}
      </div>

      {fav && record?.preferred && (
        <div className="notice small row between" style={{ padding: "8px 12px" }}>
          <span>
            ★ Meine Menge: <b>{formatAmount(record.preferred.amount, u, record.preferred.portion)}</b>
          </span>
          {!sameSelection(record.preferred, selection) && grams > 0 && (
            <button className="btn small" onClick={() => setFavorite(food, true, selection)}>
              Diese merken
            </button>
          )}
        </div>
      )}

      {food.source !== "quick" && (
        <>
          <div className="unit-chips">
            <button className={`chip${!unit ? " active" : ""}`} onClick={() => chooseUnit(null)}>
              {u}
            </button>
            {portions.map((p) => (
              <button key={p.label} className={`chip${unitLabel === p.label ? " active" : ""}`} onClick={() => chooseUnit(p.label)}>
                {p.label} ({fmt(p.amount)} {u})
              </button>
            ))}
            <button className="chip" onClick={() => setAdding((a) => !a)}>
              ＋ Portion
            </button>
          </div>

          {adding && (
            <div className="card stack" style={{ margin: 0, padding: 12 }}>
              <div className="small muted">Eigene Portion für dieses Lebensmittel, z. B. „Stück“ = 85 g</div>
              <div className="row">
                <input
                  className="input grow"
                  placeholder="Bezeichnung (Stück, Scheibe …)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <div style={{ width: 96 }} className="row">
                  <NumberInput value={newAmount} onChange={setNewAmount} placeholder={u} />
                </div>
              </div>
              <button
                className="btn primary block"
                disabled={!newLabel.trim() || !newAmount}
                onClick={async () => {
                  await savePortion([{ label: newLabel.trim(), amount: newAmount as number }]);
                  setAdding(false);
                  setNewLabel("");
                  setNewAmount("");
                }}
              >
                Portion speichern
              </button>
            </div>
          )}

          {portions.length === 0 && settings?.apiKey && !adding && (
            <button
              className="btn block"
              disabled={aiBusy}
              onClick={async () => {
                setAiBusy(true);
                setAiError(null);
                try {
                  const est = await estimatePortions(settings.apiKey!, settings.aiModel, {
                    name: food.name,
                    brand: food.brand,
                    unit: u,
                    kcalPer100: food.per100.kcal,
                  });
                  if (est.length) await savePortion(est);
                  else setAiError("Die KI kennt keine typische Portion dafür.");
                } catch (e) {
                  setAiError((e as Error).message);
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              {aiBusy ? <span className="spinner" /> : "✨ Typische Portion schätzen lassen"}
            </button>
          )}
          {aiError && <div className="notice error small">{aiError}</div>}

          <label className="field">
            <span>{unit ? `Anzahl ${unit.label}` : `Menge in ${u}`}</span>
            <div className="row">
              <NumberInput key={unitLabel ?? "base"} value={value} onChange={setValue} autoFocus={!unit} />
              <span className="muted" style={{ minWidth: 28, whiteSpace: "nowrap" }}>
                {unit ? `= ${fmt(grams)} ${u}` : u}
              </span>
            </div>
          </label>

          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {quick.map((q) => (
              <button key={q} className={`chip${value === q ? " active" : ""}`} onClick={() => setValue(q)}>
                {unit ? `${fmtCount(q)}×` : `${q} ${u}`}
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

      <button className="btn primary block" disabled={!grams} onClick={() => grams && onConfirm(selection)}>
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
  return {
    off: "Open Food Facts",
    custom: "Eigenes Lebensmittel",
    ai: "KI-Schätzung",
    quick: "Schnell-Eintrag",
    generic: "Grundnahrungsmittel (Richtwert)",
  }[s];
}
