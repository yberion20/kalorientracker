import { GENERIC_FOODS } from "../data/generic";
import { type FoodSnapshot, type Portion, allPortions } from "./nutrition";

/**
 * Eingebaute Liste der meistgescannten Produkte in Deutschland (aus Open Food Facts,
 * wöchentlich per GitHub Action aktualisiert). Ermöglicht Suche beim Tippen, auch offline.
 */
type Row = [
  string, // EAN
  string, // Name
  string, // Marke
  number, // kcal
  number, // Eiweiß
  number, // Kohlenhydrate
  number, // Fett
  number | null, // Zucker
  "g" | "ml",
  number | null, // Portionsgröße
  (string | null)?, // Portionsbezeichnung, z. B. „Riegel“
  (number | null)?, // Packungsgröße
];

interface Item {
  hay: string; // normalisiert: Name + Marke
  nameLen: number; // Länge des Namens am Anfang von hay
  rank: number; // 0 = am beliebtesten
  // Bei über 100.000 Produkten wird das Lebensmittel erst für Treffer gebaut (spart Speicher).
  row?: Row;
  food?: FoodSnapshot;
}

let items: Item[] | null = null;
let loading: Promise<Item[]> | null = null;

export function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ß/g, "ss");
}

function rowToFood([ean, name, brand, kcal, protein, carbs, fat, sugar, unit, serving, servingLabel, pack]: Row): FoodSnapshot {
  const portions: Portion[] = [];
  if (serving) portions.push({ label: servingLabel || "Portion", amount: serving });
  if (pack && pack <= 1000 && pack !== serving) portions.push({ label: "Packung", amount: pack });
  return {
    name,
    brand: brand || undefined,
    ean,
    unit,
    ...(portions.length ? { portions: allPortions({ portions }) } : {}),
    per100: { kcal, protein, carbs, fat, ...(sugar !== null ? { sugar } : {}) },
    source: "off",
  };
}

const foodOf = (it: Item) => (it.food ??= rowToFood(it.row!));

export function toItems(rows: Row[]): Item[] {
  return rows.map((row, rank) => {
    const name = normalize(row[1]);
    return { rank, nameLen: name.length, hay: row[2] ? `${name} ${normalize(row[2])}` : name, row };
  });
}

/** Grundnahrungsmittel (Brezel, Apfel, Pizza …) mit typischen Portionen. */
let generic: Item[] | null = null;
export function genericItems(): Item[] {
  generic ??= GENERIC_FOODS.map((g, rank) => ({
    rank,
    nameLen: normalize(g.food.name).length,
    hay: normalize(`${g.food.name} ${g.synonyms}`),
    food: g.food,
  }));
  return generic;
}

export function loadCatalog(): Promise<Item[]> {
  if (items) return Promise.resolve(items);
  loading ??= fetch(`${import.meta.env.BASE_URL}products-de.json`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{ products: Row[] }>;
    })
    .then((d) => (items = toItems(d.products)))
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

/** Bewertet, wie gut ein Eintrag zur Suche passt (0 = passt nicht). */
function score(it: Item, tokens: string[]): number {
  let s = 0;
  for (const t of tokens) {
    const i = it.hay.indexOf(t);
    if (i < 0) return 0;
    const atWord = i === 0 || /[^a-z0-9]/.test(it.hay[i - 1]);
    const end = it.hay[i + t.length];
    const wholeWord = atWord && (end === undefined || /[^a-z0-9]/.test(end));
    s += wholeWord ? 30 : atWord ? 20 : 5;
    // Name beginnt mit dem Suchwort: stark, wenn es ein ganzes Wort ist („Milch …“),
    // schwach bei zusammengesetzten Wörtern („Semmelknödel“ bei „Semmel“).
    if (i === 0 && t.length <= it.nameLen) {
      const next = t.length < it.nameLen ? it.hay[t.length] : "";
      s += wholeWord || !/[a-z]/.test(next) ? 25 : 8;
    }
  }
  // Kürzere Namen sind meist die „generischeren“ Treffer (z. B. „Milch“ vor „Alpenvollmilch-Schokolade“).
  s += Math.max(0, 15 - it.nameLen / 3);
  return s;
}

export function searchItems(list: Item[], query: string, limit = 40): FoodSnapshot[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const hits: { it: Item; s: number }[] = [];
  for (const it of list) {
    const s = score(it, tokens);
    if (s > 0) hits.push({ it, s });
  }
  // Beliebtheit fließt mit ein: Top-Produkte leicht bevorzugen.
  hits.sort((a, b) => b.s - b.it.rank / 800 - (a.s - a.it.rank / 800));
  return hits.slice(0, limit).map((h) => foodOf(h.it));
}
