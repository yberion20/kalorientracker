// Lädt die meistgescannten Produkte in Deutschland aus Open Food Facts
// (search.openfoodfacts.org) und schreibt eine kompakte Liste für die
// Sofort-Suche nach public/products-de.json.
//
// Aufruf: node scripts/fetch-products.mjs
// Format je Produkt: [ean, name, marke, kcal, eiweiß, kh, fett, zucker|null, einheit("g"|"ml"), portion|null]

import { writeFile } from "node:fs/promises";

const OUT = new URL("../public/products-de.json", import.meta.url);
const PAGES = 100; // 100 × 100 = 10.000 (Maximum der Such-API)
const FIELDS = [
  "code",
  "product_name",
  "product_name_de",
  "brands",
  "nutriments",
  "quantity",
  "product_quantity_unit",
  "serving_quantity",
].join(",");
const UA = "Kalorientracker/1.0 (https://github.com/yberion20/kalorientracker)";

const num = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const r1 = (n) => Math.round(n * 10) / 10;

function map(p) {
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === undefined) {
    const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  if (kcal === undefined || kcal > 950) return null;
  const name = String(p.product_name_de || p.product_name || "").trim();
  if (!name || !/^\d{8,14}$/.test(p.code ?? "")) return null;
  const brands = Array.isArray(p.brands) ? p.brands.join(",") : p.brands;
  const brand = String(brands ?? "").split(",")[0].trim();
  const unitHint = String(p.product_quantity_unit ?? "").toLowerCase();
  const liquid = ["ml", "l", "cl"].includes(unitHint) || /\b\d+([.,]\d+)?\s?(ml|cl|l)\b/i.test(p.quantity ?? "");
  const sugar = num(n["sugars_100g"]);
  const serving = num(p.serving_quantity);
  return [
    p.code,
    name,
    brand,
    Math.round(kcal),
    r1(num(n["proteins_100g"]) ?? 0),
    r1(num(n["carbohydrates_100g"]) ?? 0),
    r1(num(n["fat_100g"]) ?? 0),
    sugar === undefined ? null : r1(sugar),
    liquid ? "ml" : "g",
    serving && serving > 0 && serving < 2000 ? r1(serving) : null,
  ];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(i) {
  const url =
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent('countries_tags:"en:germany"')}` +
    `&sort_by=-unique_scans_n&page_size=100&page=${i}&fields=${FIELDS}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return (await res.json()).hits ?? [];
      console.warn(`Seite ${i}: HTTP ${res.status}`);
    } catch (e) {
      console.warn(`Seite ${i}: ${e.message}`);
    }
    await sleep(1500 * attempt);
  }
  throw new Error(`Seite ${i} konnte nicht geladen werden`);
}

const seen = new Set();
const rows = [];
for (let i = 1; i <= PAGES; i++) {
  for (const p of await page(i)) {
    const row = map(p);
    if (row && !seen.has(row[0])) {
      seen.add(row[0]);
      rows.push(row);
    }
  }
  if (i % 10 === 0) console.log(`${i}/${PAGES} Seiten, ${rows.length} Produkte`);
  await sleep(250);
}

if (rows.length < 5000) throw new Error(`Nur ${rows.length} Produkte – Datei wird nicht überschrieben.`);
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), products: rows }));
console.log(`Fertig: ${rows.length} Produkte nach ${OUT.pathname}`);
