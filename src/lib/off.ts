import type { FoodSnapshot, Nutrients, Unit } from "./nutrition";

/** Open Food Facts – freie Lebensmitteldatenbank. */
const FIELDS = [
  "code",
  "product_name",
  "product_name_de",
  "generic_name_de",
  "brands",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "serving_quantity_unit",
  "quantity",
  "product_quantity_unit",
  "image_front_small_url",
].join(",");

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_de?: string;
  generic_name_de?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  quantity?: string;
  product_quantity_unit?: string;
  image_front_small_url?: string;
}

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** Wandelt ein Open-Food-Facts-Produkt in unser Format um. Gibt null zurück, wenn keine Nährwerte da sind. */
export function mapOffProduct(p: OffProduct, ean?: string): FoodSnapshot | null {
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === undefined) {
    const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  const protein = num(n["proteins_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  const fat = num(n["fat_100g"]);
  if (kcal === undefined && protein === undefined && carbs === undefined && fat === undefined) return null;

  const per100: Nutrients = {
    kcal: kcal ?? (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9,
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
  };
  const sugar = num(n["sugars_100g"]);
  const fiber = num(n["fiber_100g"]);
  const salt = num(n["salt_100g"]);
  if (sugar !== undefined) per100.sugar = sugar;
  if (fiber !== undefined) per100.fiber = fiber;
  if (salt !== undefined) per100.salt = salt;

  const unit: Unit = isLiquid(p) ? "ml" : "g";
  const servingSize = num(p.serving_quantity);
  const name = (p.product_name_de || p.product_name || p.generic_name_de || "").trim() || "Unbekanntes Produkt";
  const brand = p.brands?.split(",")[0]?.trim() || undefined;

  return {
    name,
    brand,
    ean: ean ?? p.code,
    per100,
    unit,
    servingSize: servingSize && servingSize > 0 ? servingSize : undefined,
    servingLabel: p.serving_size || undefined,
    imageUrl: p.image_front_small_url,
    source: "off",
  };
}

function isLiquid(p: OffProduct): boolean {
  const u = (p.product_quantity_unit || p.serving_quantity_unit || "").toLowerCase();
  if (u === "ml" || u === "l" || u === "cl") return true;
  return /\b\d+([.,]\d+)?\s?(ml|cl|l)\b/i.test(p.quantity ?? "");
}

export class OffError extends Error {
  constructor(
    message: string,
    public kind: "not_found" | "no_nutrients" | "network",
  ) {
    super(message);
  }
}

export async function lookupBarcode(ean: string): Promise<FoodSnapshot> {
  const code = ean.replace(/\D/g, "");
  let res: Response;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`);
  } catch {
    throw new OffError("Keine Verbindung zu Open Food Facts.", "network");
  }
  if (res.status === 404) throw new OffError("Produkt nicht in Open Food Facts gefunden.", "not_found");
  if (!res.ok) throw new OffError(`Open Food Facts antwortet nicht (${res.status}).`, "network");
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (!data.product || data.status === 0) throw new OffError("Produkt nicht in Open Food Facts gefunden.", "not_found");
  const food = mapOffProduct(data.product, code);
  if (!food) throw new OffError("Produkt gefunden, aber ohne Nährwerte.", "no_nutrients");
  return food;
}

export async function searchOff(query: string, signal?: AbortSignal): Promise<FoodSnapshot[]> {
  const q = encodeURIComponent(query.trim());
  // Nur world.openfoodfacts.org liefert CORS-Header. Die Textsuche ist dort auf ca. 10 Anfragen
  // pro Minute begrenzt; bei Überschreitung kommt 503 ohne CORS-Header (im Browser: Netzwerkfehler).
  // Deshalb genau eine Anfrage pro Suche, ohne automatische Wiederholung.
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=30&sort_by=unique_scans_n&fields=${FIELDS}`;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    if (!navigator.onLine) throw new OffError("Keine Internetverbindung.", "network");
    throw new OffError(
      "Open Food Facts lässt nur wenige Online-Suchen pro Minute zu. Bitte etwa eine Minute warten – oder den Barcode scannen.",
      "network",
    );
  }
  if (!res.ok) throw new OffError(`Online-Suche fehlgeschlagen (${res.status}). Bitte gleich nochmal versuchen.`, "network");
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map((p) => mapOffProduct(p)).filter((f): f is FoodSnapshot => !!f);
}
