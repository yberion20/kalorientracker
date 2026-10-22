export const SHORTCUT_NAME = "Kalorien Health";

export function shortcutUrl() {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
}

export interface HealthImport {
  date?: string;
  steps: number;
  activeKcal: number;
}

const toNum = (s: string | undefined) => {
  if (!s) return NaN;
  // Kurzbefehle formatiert Zahlen je nach Region mit Tausenderpunkt und Dezimalkomma.
  const cleaned = s.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return parseFloat(cleaned);
};

/**
 * Liest den vom Kurzbefehl kopierten Text. Akzeptiert JSON
 * ({"steps":1234,"activeKcal":456}) und das einfache Format "Schritte: 1234; Kalorien: 456".
 */
export function parseHealthText(text: string): HealthImport | null {
  const t = text.trim();
  try {
    const j = JSON.parse(t);
    const steps = toNum(String(j.steps ?? j.schritte ?? ""));
    const kcal = toNum(String(j.activeKcal ?? j.kcal ?? j.kalorien ?? ""));
    if (Number.isFinite(steps) || Number.isFinite(kcal)) {
      return {
        date: typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : undefined,
        steps: Number.isFinite(steps) ? Math.round(steps) : 0,
        activeKcal: Number.isFinite(kcal) ? Math.round(kcal) : 0,
      };
    }
  } catch {
    /* kein JSON */
  }
  const steps = toNum(t.match(/schritte\D*([\d.,\s]+)/i)?.[1]?.trim());
  const kcal = toNum(t.match(/(kalorien|kcal|energie)\D*([\d.,\s]+)/i)?.[2]?.trim());
  if (!Number.isFinite(steps) && !Number.isFinite(kcal)) return null;
  return {
    steps: Number.isFinite(steps) ? Math.round(steps) : 0,
    activeKcal: Number.isFinite(kcal) ? Math.round(kcal) : 0,
  };
}
