import { useState } from "react";
import type { FoodSnapshot, Unit } from "../lib/nutrition";
import { NumberInput } from "./ui";

type Num = number | "";

export function CustomFoodForm({
  initial,
  onSave,
  saveLabel = "Speichern & Menge wählen",
}: {
  initial?: Partial<FoodSnapshot>;
  onSave: (f: FoodSnapshot) => void;
  saveLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [ean, setEan] = useState(initial?.ean ?? "");
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? "g");
  const [kcal, setKcal] = useState<Num>(initial?.per100?.kcal ?? "");
  const [protein, setProtein] = useState<Num>(initial?.per100?.protein ?? "");
  const [carbs, setCarbs] = useState<Num>(initial?.per100?.carbs ?? "");
  const [fat, setFat] = useState<Num>(initial?.per100?.fat ?? "");
  const [sugar, setSugar] = useState<Num>(initial?.per100?.sugar ?? "");
  const [serving, setServing] = useState<Num>(initial?.servingSize ?? "");

  const valid = name.trim() && kcal !== "";

  return (
    <div className="stack">
      <label className="field">
        <span>Name *</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Omas Kartoffelsalat" />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Marke</span>
          <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>
        <label className="field">
          <span>Barcode (EAN)</span>
          <input className="input" inputMode="numeric" value={ean} onChange={(e) => setEan(e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>
      <div className="segment">
        <button className={unit === "g" ? "active" : ""} onClick={() => setUnit("g")}>
          Fest (g)
        </button>
        <button className={unit === "ml" ? "active" : ""} onClick={() => setUnit("ml")}>
          Flüssig (ml)
        </button>
      </div>
      <div className="section-title" style={{ margin: "8px 0 0" }}>
        Nährwerte pro 100 {unit}
      </div>
      <div className="grid2">
        <label className="field">
          <span>Kalorien (kcal) *</span>
          <NumberInput value={kcal} onChange={setKcal} />
        </label>
        <label className="field">
          <span>Eiweiß (g)</span>
          <NumberInput value={protein} onChange={setProtein} />
        </label>
        <label className="field">
          <span>Kohlenhydrate (g)</span>
          <NumberInput value={carbs} onChange={setCarbs} />
        </label>
        <label className="field">
          <span>davon Zucker (g)</span>
          <NumberInput value={sugar} onChange={setSugar} />
        </label>
        <label className="field">
          <span>Fett (g)</span>
          <NumberInput value={fat} onChange={setFat} />
        </label>
        <label className="field">
          <span>Portionsgröße ({unit})</span>
          <NumberInput value={serving} onChange={setServing} />
        </label>
      </div>
      <button
        className="btn primary block"
        disabled={!valid}
        onClick={() =>
          onSave({
            name: name.trim(),
            brand: brand.trim() || undefined,
            ean: ean || undefined,
            unit,
            servingSize: serving || undefined,
            per100: {
              kcal: kcal || 0,
              protein: protein || 0,
              carbs: carbs || 0,
              fat: fat || 0,
              ...(sugar !== "" ? { sugar } : {}),
            },
            source: "custom",
          })
        }
      >
        {saveLabel}
      </button>
    </div>
  );
}

export function QuickAddForm({ onSave }: { onSave: (f: FoodSnapshot) => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState<Num>("");
  const [protein, setProtein] = useState<Num>("");
  const [carbs, setCarbs] = useState<Num>("");
  const [fat, setFat] = useState<Num>("");
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Nur Kalorien (und optional Makros) eintragen, z. B. für ein Restaurantgericht.
      </p>
      <label className="field">
        <span>Bezeichnung</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Schnell-Eintrag" />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Kalorien (kcal) *</span>
          <NumberInput value={kcal} onChange={setKcal} />
        </label>
        <label className="field">
          <span>Eiweiß (g)</span>
          <NumberInput value={protein} onChange={setProtein} />
        </label>
        <label className="field">
          <span>Kohlenhydrate (g)</span>
          <NumberInput value={carbs} onChange={setCarbs} />
        </label>
        <label className="field">
          <span>Fett (g)</span>
          <NumberInput value={fat} onChange={setFat} />
        </label>
      </div>
      <button
        className="btn primary block"
        disabled={kcal === ""}
        onClick={() =>
          onSave({
            name: name.trim() || "Schnell-Eintrag",
            unit: "g",
            // Bei Schnell-Einträgen gilt: Menge = 100, also per100 = absolute Werte.
            per100: { kcal: kcal || 0, protein: protein || 0, carbs: carbs || 0, fat: fat || 0 },
            source: "quick",
          })
        }
      >
        Eintragen
      </button>
    </div>
  );
}
