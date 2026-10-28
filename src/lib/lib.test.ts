import { describe, expect, it } from "vitest";
import { parseHealthText } from "./health";
import {
  addDays,
  allPortions,
  bmr,
  calorieTarget,
  dayFactor,
  eatWindowMinutes,
  fastingStatus,
  formatAmount,
  goalsForDay,
  macroGrams,
  portionLabelFrom,
  scale,
  sum,
} from "./nutrition";
import { mapOffProduct } from "./off";
import { genericItems, searchItems, toItems } from "./catalog";

describe("nutrition", () => {
  it("rechnet Nährwerte auf die Menge um", () => {
    const n = scale({ kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sugar: 56.3 }, 15);
    expect(n.kcal).toBeCloseTo(80.85);
    expect(n.protein).toBeCloseTo(0.945);
    expect(n.sugar).toBeCloseTo(8.445);
  });

  it("summiert Einträge", () => {
    const t = sum([
      { kcal: 100, protein: 10, carbs: 5, fat: 2 },
      { kcal: 250, protein: 3, carbs: 40, fat: 8 },
    ]);
    expect(t).toMatchObject({ kcal: 350, protein: 13, carbs: 45, fat: 10 });
  });

  it("berechnet Grundumsatz und Ziel", () => {
    const p = { sex: "male" as const, age: 35, heightCm: 180, weightKg: 85, activity: "light" as const, goal: "lose" as const, rateKgPerWeek: 0.5 };
    expect(bmr(p)).toBeCloseTo(1805);
    // 1805 * 1.375 = 2481.9; minus 550 = 1931.9 → gerundet 1930
    expect(calorieTarget(p)).toBe(1930);
    expect(macroGrams(2000, { protein: 30, carbs: 40, fat: 30 })).toEqual({ protein: 150, carbs: 200, fat: 67 });
  });

  it("rechnet Daten über Monatsgrenzen", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("Open Food Facts", () => {
  it("liest Nährwerte pro 100 g", () => {
    const f = mapOffProduct(
      {
        product_name: "Nutella",
        brands: "Nutella, Ferrero",
        quantity: "400 g",
        serving_quantity: "15",
        serving_size: "15 g",
        nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sugars_100g: 56.3 },
      },
      "3017620422003",
    )!;
    expect(f).toMatchObject({ name: "Nutella", brand: "Nutella", ean: "3017620422003", unit: "g", servingSize: 15 });
    expect(f.per100).toMatchObject({ kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sugar: 56.3 });
  });

  it("rechnet kJ in kcal um, wenn kcal fehlt", () => {
    const f = mapOffProduct({ product_name: "X", nutriments: { "energy-kj_100g": 418.4, proteins_100g: "3,5" } })!;
    expect(f.per100.kcal).toBeCloseTo(100);
    expect(f.per100.protein).toBe(3.5);
  });

  it("erkennt Getränke an ml", () => {
    const f = mapOffProduct({ product_name: "Cola", quantity: "1,5 l", nutriments: { "energy-kcal_100g": 42 } })!;
    expect(f.unit).toBe("ml");
  });

  it("gibt null ohne Nährwerte zurück", () => {
    expect(mapOffProduct({ product_name: "Leer", nutriments: {} })).toBeNull();
  });
});

describe("Health-Import", () => {
  it("liest das Kurzbefehl-Textformat mit deutschen Zahlen", () => {
    expect(parseHealthText("Schritte: 12.345; Kalorien: 456,7")).toEqual({ steps: 12345, activeKcal: 457 });
  });

  it("liest JSON", () => {
    expect(parseHealthText('{"date":"2026-10-22","steps":8000,"activeKcal":320}')).toEqual({
      date: "2026-10-22",
      steps: 8000,
      activeKcal: 320,
    });
  });

  it("lehnt fremden Text ab", () => {
    expect(parseHealthText("Hallo Welt")).toBeNull();
  });
});

describe("Produktliste", () => {
  const rows = [
    ["1", "Alpenvollmilch Schokolade", "Milka", 530, 6, 58, 29, 57, "g", null],
    ["2", "Frische Vollmilch 3,5 %", "Weihenstephan", 64, 3.4, 4.8, 3.5, 4.8, "ml", null],
    ["3", "Haltbare Milch", "Milbona", 47, 3.4, 4.9, 1.5, 4.9, "ml", 250],
    ["4", "Müsli Crunchy", "Kölln", 450, 9, 60, 17, 20, "g", null],
  ] as Parameters<typeof toItems>[0];
  const list = toItems(rows);

  it("findet ganze Wörter vor Wortteilen", () => {
    expect(searchItems(list, "milch")[0].name).toBe("Haltbare Milch");
  });

  it("ignoriert Umlaute und Groß-/Kleinschreibung", () => {
    expect(searchItems(list, "musli").map((f) => f.ean)).toEqual(["4"]);
  });

  it("verlangt alle Suchwörter", () => {
    expect(searchItems(list, "milch weihen").map((f) => f.ean)).toEqual(["2"]);
  });

  it("übernimmt Nährwerte und Einheit", () => {
    const f = searchItems(list, "haltbare")[0];
    expect(f).toMatchObject({ unit: "ml", portions: [{ label: "Portion", amount: 250 }], source: "off", per100: { kcal: 47, fat: 1.5 } });
  });
});

describe("Tagesziele", () => {
  const goals = { kcal: 2000, protein: 150, carbs: 200, fat: 67, waterMl: 2500 };
  const weekend = { enabled: true, days: [0, 6], percent: 20, balance: true };

  it("erhöht das Ziel an den gewählten Tagen", () => {
    // 2026-10-24 ist ein Samstag
    expect(goalsForDay(goals, weekend, "2026-10-24")).toMatchObject({ kcal: 2400, protein: 180 });
  });

  it("gleicht die übrigen Tage aus, sodass die Woche gleich bleibt", () => {
    const week = [0, 1, 2, 3, 4, 5, 6].reduce((s, d) => s + dayFactor(weekend, d), 0);
    expect(week).toBeCloseTo(7);
    // 2026-10-21 ist ein Mittwoch: (7 − 2 × 1,2) / 5 = 0,92
    expect(goalsForDay(goals, weekend, "2026-10-21").kcal).toBe(1840);
  });

  it("lässt die übrigen Tage ohne Ausgleich unverändert", () => {
    expect(goalsForDay(goals, { ...weekend, balance: false }, "2026-10-21").kcal).toBe(2000);
  });

  it("ist ohne Aktivierung neutral", () => {
    expect(goalsForDay(goals, { ...weekend, enabled: false }, "2026-10-24").kcal).toBe(2000);
  });
});

describe("Intervallfasten", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 22, h, m);

  it("erkennt das Essensfenster", () => {
    const s = fastingStatus({ eatStart: "12:00", eatEnd: "20:00" }, at(14));
    expect(s).toMatchObject({ phase: "eat", minutesLeft: 360, nextChange: "20:00" });
    expect(s.progress).toBeCloseTo(0.25);
  });

  it("erkennt das Fasten über Mitternacht", () => {
    const s = fastingStatus({ eatStart: "12:00", eatEnd: "20:00" }, at(2));
    expect(s).toMatchObject({ phase: "fast", minutesLeft: 600, nextChange: "12:00" });
    expect(s.progress).toBeCloseTo(6 / 16);
  });

  it("unterstützt Essensfenster über Mitternacht", () => {
    expect(eatWindowMinutes({ eatStart: "18:00", eatEnd: "02:00" })).toBe(480);
    expect(fastingStatus({ eatStart: "18:00", eatEnd: "02:00" }, at(1)).phase).toBe("eat");
    expect(fastingStatus({ eatStart: "18:00", eatEnd: "02:00" }, at(10)).phase).toBe("fast");
  });
});

describe("Portionen", () => {
  it("leitet Bezeichnungen aus Open-Food-Facts-Angaben ab", () => {
    expect(portionLabelFrom("1 Riegel (25 g)")).toBe("Riegel");
    expect(portionLabelFrom("2 slices (40 g)")).toBe("Scheibe");
    expect(portionLabelFrom("30 g")).toBe("Portion");
    expect(portionLabelFrom(undefined)).toBe("Portion");
  });

  it("übernimmt Portion und Packung beim Barcode-Abruf", () => {
    const f = mapOffProduct({
      product_name: "Riegel",
      serving_size: "1 Riegel (25 g)",
      serving_quantity: 25,
      product_quantity: 150,
      nutriments: { "energy-kcal_100g": 450 },
    })!;
    expect(f.portions).toEqual([
      { label: "Riegel", amount: 25 },
      { label: "Packung", amount: 150 },
    ]);
  });

  it("entfernt doppelte Portionen und ergänzt die Portionsgröße", () => {
    expect(allPortions({ portions: [{ label: "Stück", amount: 85 }, { label: "stück", amount: 90 }], servingSize: 40 })).toEqual([
      { label: "Stück", amount: 85 },
      { label: "Portion", amount: 40 },
    ]);
  });

  it("formatiert Mengen mit Portion", () => {
    expect(formatAmount(127.5, "g", { label: "Stück", size: 85, count: 1.5 })).toBe("1,5 Stück (128 g)");
    expect(formatAmount(42.5, "g", { label: "Stück", size: 85, count: 0.5 })).toBe("½ Stück (43 g)");
    expect(formatAmount(150, "g")).toBe("150 g");
  });

  it("findet Grundnahrungsmittel über Synonyme", () => {
    const f = searchItems(genericItems(), "breze")[0];
    expect(f.name).toBe("Brezel (Laugenbrezel)");
    expect(f.portions).toEqual([{ label: "Stück", amount: 85 }]);
    expect(searchItems(genericItems(), "semmel")[0].name).toMatch(/brötchen/i);
  });
});
