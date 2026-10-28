import Dexie, { type EntityTable } from "dexie";
import {
  DEFAULT_DAY_ADJUST,
  DEFAULT_FASTING,
  type DayAdjust,
  type Fasting,
  type FoodSnapshot,
  type Goals,
  type MacroSplit,
  type Meal,
  type Nutrients,
  type Portion,
  type PortionChoice,
  type Selection,
  mergePortions,
  type Profile,
  scale,
} from "./lib/nutrition";

export interface Food extends FoodSnapshot {
  id: string;
  favorite: 0 | 1;
  lastUsedAt: number;
  useCount: number;
  /** Standardmenge für Favoriten („meine Menge“) */
  preferred?: Selection;
  /** Zuletzt gewählte Menge */
  lastSelection?: Selection;
}

export interface Entry {
  id: string;
  date: string;
  meal: Meal;
  food: FoodSnapshot;
  amount: number;
  portion?: PortionChoice;
  nutrients: Nutrients;
  createdAt: number;
}

export interface SavedMealItem {
  food: FoodSnapshot;
  amount: number;
  portion?: PortionChoice;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
  updatedAt: number;
}

export interface Weight {
  date: string;
  kg: number;
}

export interface Water {
  date: string;
  ml: number;
}

export interface Health {
  date: string;
  steps: number;
  activeKcal: number;
  importedAt: number;
}

export interface Settings {
  id: "main";
  profile?: Profile;
  split: MacroSplit;
  goals: Goals;
  apiKey?: string;
  aiModel: string;
  addActiveKcalToBudget: boolean;
  lastBackupAt?: number;
  dayAdjust: DayAdjust;
  fasting: Fasting;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "main",
  split: { protein: 30, carbs: 40, fat: 30 },
  goals: { kcal: 2000, protein: 150, carbs: 200, fat: 67, waterMl: 2500 },
  aiModel: "claude-opus-5-5",
  addActiveKcalToBudget: false,
  dayAdjust: DEFAULT_DAY_ADJUST,
  fasting: DEFAULT_FASTING,
};

export const db = new Dexie("kalorientracker") as Dexie & {
  foods: EntityTable<Food, "id">;
  entries: EntityTable<Entry, "id">;
  savedMeals: EntityTable<SavedMeal, "id">;
  weights: EntityTable<Weight, "date">;
  water: EntityTable<Water, "date">;
  health: EntityTable<Health, "date">;
  settings: EntityTable<Settings, "id">;
};

db.version(1).stores({
  foods: "id, ean, name, favorite, lastUsedAt, source",
  entries: "id, date, [date+meal], createdAt",
  savedMeals: "id, name, updatedAt",
  weights: "date",
  water: "date",
  health: "date",
  settings: "id",
});

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get("main");
  return { ...DEFAULT_SETTINGS, ...s, goals: { ...DEFAULT_SETTINGS.goals, ...s?.goals } };
}

export async function saveSettings(patch: Partial<Settings>) {
  // In einer Transaktion, damit schnell aufeinanderfolgende Änderungen sich nicht überschreiben.
  await db.transaction("rw", db.settings, async () => {
    const current = await getSettings();
    await db.settings.put({ ...current, ...patch, id: "main" });
  });
}

/** Schlüssel zur Wiedererkennung eines Lebensmittels im lokalen Katalog. */
export function foodKey(f: FoodSnapshot) {
  return f.ean ? `ean:${f.ean}` : `${f.source}:${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`;
}

/** Legt ein Lebensmittel im lokalen Katalog an bzw. aktualisiert Nutzung. */
export async function rememberFood(f: FoodSnapshot, patch: Partial<Food> = {}): Promise<Food> {
  if (f.source === "quick") return { ...f, id: "", favorite: 0, lastUsedAt: 0, useCount: 0 };
  const id = foodKey(f);
  const existing = await db.foods.get(id);
  const food: Food = {
    ...existing,
    ...f,
    portions: mergePortions(existing?.portions, f.portions),
    id,
    favorite: existing?.favorite ?? 0,
    lastUsedAt: Date.now(),
    useCount: (existing?.useCount ?? 0) + 1,
    ...patch,
  };
  await db.foods.put(food);
  return food;
}

/** Speichert ein Lebensmittel im Katalog, ohne die Nutzung zu zählen (z. B. nach Scan oder Anlegen). */
export async function ensureFood(f: FoodSnapshot) {
  const id = foodKey(f);
  const existing = await db.foods.get(id);
  await db.foods.put({
    ...existing,
    ...snapshotOf(f),
    portions: mergePortions(existing?.portions, f.portions),
    id,
    favorite: existing?.favorite ?? 0,
    lastUsedAt: existing?.lastUsedAt ?? 0,
    useCount: existing?.useCount ?? 0,
  });
}

export async function setFavorite(f: FoodSnapshot, favorite: boolean, preferred?: Selection) {
  const id = foodKey(f);
  const existing = await db.foods.get(id);
  const patch = { favorite: (favorite ? 1 : 0) as 0 | 1, preferred: favorite ? (preferred ?? existing?.preferred) : undefined };
  if (existing) await db.foods.update(id, patch);
  else await db.foods.put({ ...snapshotOf(f), id, lastUsedAt: 0, useCount: 0, ...patch });
}

/** Speichert eine zusätzliche Portion (z. B. selbst angelegt oder von der KI geschätzt). */
export async function addPortions(f: FoodSnapshot, portions: Portion[]) {
  await ensureFood({ ...f, portions: mergePortions(f.portions, portions) });
}

export function snapshotOf(f: Food | FoodSnapshot): FoodSnapshot {
  const { name, brand, ean, per100, unit, servingSize, servingLabel, imageUrl, source, portions } = f;
  return { name, brand, ean, per100, unit, servingSize, servingLabel, imageUrl, source, portions };
}

export async function addEntry(date: string, meal: Meal, food: FoodSnapshot, amount: number, portion?: PortionChoice) {
  const entry: Entry = {
    id: uid(),
    date,
    meal,
    food: snapshotOf(food),
    amount,
    ...(portion ? { portion } : {}),
    nutrients: scale(food.per100, amount),
    createdAt: Date.now(),
  };
  await db.entries.add(entry);
  await rememberFood(food, { lastSelection: { amount, portion } });
  return entry;
}

export async function updateEntry(id: string, patch: { amount?: number; meal?: Meal; portion?: PortionChoice }) {
  const e = await db.entries.get(id);
  if (!e) return;
  const amount = patch.amount ?? e.amount;
  await db.entries.update(id, {
    ...patch,
    amount,
    nutrients: scale(e.food.per100, amount),
  });
}

export async function addSavedMealToDay(meal: SavedMeal, date: string, slot: Meal, factor = 1) {
  const now = Date.now();
  await db.entries.bulkAdd(
    meal.items.map((it, i) => ({
      id: uid(),
      date,
      meal: slot,
      food: it.food,
      amount: it.amount * factor,
      ...(it.portion ? { portion: { ...it.portion, count: it.portion.count * factor } } : {}),
      nutrients: scale(it.food.per100, it.amount * factor),
      createdAt: now + i,
    })),
  );
}

export async function copyMeal(fromDate: string, toDate: string, slot: Meal) {
  const src = await db.entries.where("[date+meal]").equals([fromDate, slot]).sortBy("createdAt");
  const now = Date.now();
  await db.entries.bulkAdd(src.map((e, i) => ({ ...e, id: uid(), date: toDate, createdAt: now + i })));
  return src.length;
}
