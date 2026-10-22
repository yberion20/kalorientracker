import type { FoodSnapshot } from "./nutrition";

/**
 * Eingebaute Liste der meistgescannten Produkte in Deutschland (aus Open Food Facts,
 * wöchentlich per GitHub Action aktualisiert). Ermöglicht Suche beim Tippen, auch offline.
 */
type Row = [string, string, string, number, number, number, number, number | null, "g" | "ml", number | null];

interface Item {
  food: FoodSnapshot;
  name: string; // normalisiert
  hay: string; // normalisiert: Name + Marke
  rank: number; // 0 = am beliebtesten
}

let items: Item[] | null = null;
let loading: Promise<Item[]> | null = null;

export function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ß/g, "ss");
}

export function toItems(rows: Row[]): Item[] {
  return rows.map(([ean, name, brand, kcal, protein, carbs, fat, sugar, unit, serving], rank) => ({
    rank,
    name: normalize(name),
    hay: normalize(`${name} ${brand}`),
    food: {
      name,
      brand: brand || undefined,
      ean,
      unit,
      servingSize: serving ?? undefined,
      per100: { kcal, protein, carbs, fat, ...(sugar !== null ? { sugar } : {}) },
      source: "off",
    },
  }));
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
    if (it.name.startsWith(t)) s += 25;
  }
  // Kürzere Namen sind meist die „generischeren“ Treffer (z. B. „Milch“ vor „Alpenvollmilch-Schokolade“).
  s += Math.max(0, 15 - it.name.length / 3);
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
  return hits.slice(0, limit).map((h) => h.it.food);
}
