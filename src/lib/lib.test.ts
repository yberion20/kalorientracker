import { describe, expect, it } from "vitest";
import { parseHealthText } from "./health";
import { addDays, bmr, calorieTarget, macroGrams, scale, sum } from "./nutrition";
import { mapOffProduct } from "./off";

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
