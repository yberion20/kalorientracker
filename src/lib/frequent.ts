import { foodKey } from "../db";
import type { Entry } from "../db";
import type { FoodSnapshot, Selection } from "./nutrition";

/** Wie viele der letzten Lebensmitteleinträge ausgewertet werden. */
export const FREQUENT_WINDOW = 200;
/** Ab so vielen Einträgen im Fenster gilt ein Lebensmittel als „häufig“. */
export const FREQUENT_MIN = 2;
/** Ab so vielen Einträgen schlagen wir vor, es als Favorit zu speichern. */
export const SUGGEST_FAVORITE_MIN = 5;

export interface FrequentFood {
  key: string;
  food: FoodSnapshot;
  count: number;
  /** Die am häufigsten gewählte Menge (bei Gleichstand die zuletzt genutzte). */
  selection: Selection;
}

const selKey = (s: Selection) => `${Math.round(s.amount * 10) / 10}|${s.portion?.label ?? ""}|${s.portion?.count ?? ""}`;

/**
 * Häufigste Lebensmittel in den letzten {@link FREQUENT_WINDOW} Lebensmitteleinträgen.
 * Einträge aus gespeicherten Mahlzeiten und reine Kalorien-Schnelleinträge zählen nicht.
 */
export function frequentFoods(entries: Entry[], window = FREQUENT_WINDOW, min = FREQUENT_MIN): FrequentFood[] {
  const recent = entries
    .filter((e) => !e.fromMeal && e.food.source !== "quick")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, window);

  const groups = new Map<string, { food: FoodSnapshot; count: number; lastAt: number; sels: Map<string, { sel: Selection; n: number; lastAt: number }> }>();
  for (const e of recent) {
    const key = foodKey(e.food);
    let g = groups.get(key);
    // Neueste zuerst: der erste Treffer liefert den aktuellsten Stand des Lebensmittels.
    if (!g) groups.set(key, (g = { food: e.food, count: 0, lastAt: e.createdAt, sels: new Map() }));
    g.count++;
    const sel: Selection = { amount: e.amount, ...(e.portion ? { portion: e.portion } : {}) };
    const sk = selKey(sel);
    const s = g.sels.get(sk);
    if (s) s.n++;
    else g.sels.set(sk, { sel, n: 1, lastAt: e.createdAt });
  }

  return [...groups.entries()]
    .filter(([, g]) => g.count >= min)
    .map(([key, g]) => {
      const best = [...g.sels.values()].sort((a, b) => b.n - a.n || b.lastAt - a.lastAt)[0];
      return { key, food: g.food, count: g.count, selection: best.sel, lastAt: g.lastAt };
    })
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .map(({ lastAt: _lastAt, ...f }) => f);
}
