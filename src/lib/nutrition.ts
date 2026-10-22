export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export const MEALS: { id: Meal; label: string; icon: string }[] = [
  { id: "breakfast", label: "Frühstück", icon: "☕" },
  { id: "lunch", label: "Mittagessen", icon: "🍲" },
  { id: "dinner", label: "Abendessen", icon: "🍽️" },
  { id: "snack", label: "Snacks", icon: "🍎" },
];

/** Nährwerte, entweder pro 100 g/ml oder absolut für eine Menge. */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  fiber?: number;
  salt?: number;
}

export type Unit = "g" | "ml";

export interface FoodSnapshot {
  name: string;
  brand?: string;
  ean?: string;
  per100: Nutrients;
  unit: Unit;
  /** Portionsgröße in g/ml, falls bekannt (z. B. "1 Riegel = 25 g"). */
  servingSize?: number;
  servingLabel?: string;
  imageUrl?: string;
  source: "off" | "custom" | "ai" | "quick";
}

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, salt: 0 };

const OPTIONAL_KEYS = ["sugar", "fiber", "salt"] as const;

/** Rechnet Nährwerte pro 100 auf eine konkrete Menge um. */
export function scale(per100: Nutrients, amount: number): Nutrients {
  const f = (amount || 0) / 100;
  const out: Nutrients = {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    carbs: per100.carbs * f,
    fat: per100.fat * f,
  };
  for (const k of OPTIONAL_KEYS) {
    if (per100[k] != null) out[k] = (per100[k] as number) * f;
  }
  return out;
}

export function sum(list: Nutrients[]): Nutrients {
  const out: Nutrients = { ...ZERO };
  for (const n of list) {
    out.kcal += n.kcal || 0;
    out.protein += n.protein || 0;
    out.carbs += n.carbs || 0;
    out.fat += n.fat || 0;
    for (const k of OPTIONAL_KEYS) out[k] = (out[k] ?? 0) + (n[k] ?? 0);
  }
  return out;
}

/** Nährwerte pro 100 aus absoluten Werten für eine Menge zurückrechnen. */
export function toPer100(total: Nutrients, amount: number): Nutrients {
  if (!amount) return { ...total };
  return scale(total, (100 * 100) / amount);
}

export const round = (n: number, digits = 0) => {
  const p = 10 ** digits;
  return Math.round((n + Number.EPSILON) * p) / p;
};

export const fmt = (n: number, digits = 0) =>
  round(n, digits).toLocaleString("de-DE", { maximumFractionDigits: digits });

// ---------- Ziele ----------

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalType = "lose" | "maintain" | "gain";

export const ACTIVITY: { id: Activity; label: string; factor: number }[] = [
  { id: "sedentary", label: "Kaum aktiv (Büro, wenig Bewegung)", factor: 1.2 },
  { id: "light", label: "Leicht aktiv (1–3× Sport/Woche)", factor: 1.375 },
  { id: "moderate", label: "Mäßig aktiv (3–5× Sport/Woche)", factor: 1.55 },
  { id: "active", label: "Sehr aktiv (6–7× Sport/Woche)", factor: 1.725 },
  { id: "very_active", label: "Extrem aktiv (körperliche Arbeit + Sport)", factor: 1.9 },
];

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: GoalType;
  /** kg pro Woche, z. B. 0.5 */
  rateKgPerWeek: number;
  targetWeightKg?: number;
}

export interface MacroSplit {
  protein: number; // Prozent der kcal
  carbs: number;
  fat: number;
}

export interface Goals {
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  waterMl: number;
}

/** Grundumsatz nach Mifflin-St Jeor. */
export function bmr(p: Pick<Profile, "sex" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === "male" ? base + 5 : base - 161;
}

export function tdee(p: Profile): number {
  const f = ACTIVITY.find((a) => a.id === p.activity)?.factor ?? 1.2;
  return bmr(p) * f;
}

/** ~7700 kcal pro kg Körperfett. */
export function calorieTarget(p: Profile): number {
  const delta = (p.rateKgPerWeek * 7700) / 7;
  const t = tdee(p);
  const target = p.goal === "lose" ? t - delta : p.goal === "gain" ? t + delta : t;
  const floor = p.sex === "male" ? 1500 : 1200;
  return Math.round(Math.max(target, floor) / 10) * 10;
}

export function macroGrams(kcal: number, split: MacroSplit): Pick<Goals, "protein" | "carbs" | "fat"> {
  return {
    protein: Math.round((kcal * split.protein) / 100 / 4),
    carbs: Math.round((kcal * split.carbs) / 100 / 4),
    fat: Math.round((kcal * split.fat) / 100 / 9),
  };
}

// ---------- Datum ----------

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

export function formatDayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Heute";
  if (iso === addDays(today, -1)) return "Gestern";
  if (iso === addDays(today, 1)) return "Morgen";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}
