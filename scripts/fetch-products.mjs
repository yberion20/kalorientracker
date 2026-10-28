// Lädt den kompletten Open-Food-Facts-Export (CSV, ca. 1,5 GB gepackt), filtert alle in
// Deutschland verkauften Produkte mit Nährwerten und schreibt eine kompakte Liste für die
// Sofort-Suche nach public/products-de.json – sortiert nach Beliebtheit (Scans).
//
// Aufruf: node scripts/fetch-products.mjs [lokale-datei.csv.gz]
// Format je Produkt: [ean, name, marke, kcal, eiweiß, kh, fett, zucker|null, einheit("g"|"ml"),
//                     portion|null, portionsbezeichnung|null, packung|null]

import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

const OUT = new URL("../public/products-de.json", import.meta.url);
const DUMP = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz";
// Obergrenze, damit die Datei auf dem iPhone handlich bleibt (ca. 90 Byte je Produkt).
const LIMIT = Number(process.env.CATALOG_LIMIT ?? 300_000);
const UA = "Kalorientracker/1.0 (https://github.com/yberion20/kalorientracker)";

const num = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const r1 = (n) => Math.round(n * 10) / 10;

// Entspricht portionLabelFrom() in src/lib/nutrition.ts
const EN = {
  slice: "Scheibe", slices: "Scheibe", bar: "Riegel", piece: "Stück", pieces: "Stück", pcs: "Stück",
  cup: "Tasse", glass: "Glas", bottle: "Flasche", can: "Dose", biscuit: "Keks", biscuits: "Keks",
  cookie: "Keks", cookies: "Keks", egg: "Ei", tablespoon: "EL", tbsp: "EL", teaspoon: "TL", tsp: "TL",
  pot: "Becher", pack: "Packung", sachet: "Beutel",
};
function portionLabel(text) {
  const m = /^\s*(?:\d+[.,]?\d*\s*|ein[e]?\s+)?([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]{1,20})/.exec(text ?? "");
  const w = m?.[1];
  if (!w || /^(g|gr|gramm|grams?|ml|cl|l|portions?|servings?|serve|oz|kg)$/i.test(w)) return null;
  return EN[w.toLowerCase()] ?? w[0].toUpperCase() + w.slice(1);
}

const UNIT_FACTOR = { g: 1, ml: 1, cl: 10, l: 1000, kg: 1000 };
/** Liest „500 g“, „0,33 l“ oder „4 x 125 g“ → { pack, each } in g/ml. */
function parseQuantity(text) {
  const t = String(text ?? "").toLowerCase().replace(",", ".");
  const multi = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/.exec(t);
  if (multi) {
    const each = Number(multi[2]) * UNIT_FACTOR[multi[3]];
    return { pack: Number(multi[1]) * each, each };
  }
  const single = /(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/.exec(t);
  return single ? { pack: Number(single[1]) * UNIT_FACTOR[single[2]], each: null } : { pack: null, each: null };
}

// Manche Einträge enthalten HTML-Entities („Vanilla &amp; Topping“).
const ENT = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const decode = (t) =>
  String(t ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" || e[1] === "X" ? 2 : 1), e[1]?.toLowerCase() === "x" ? 16 : 10)) : (ENT[e.toLowerCase()] ?? m),
  );

function map(p) {
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === undefined) {
    const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  if (kcal === undefined || kcal > 950) return null;
  const name = decode(p.product_name_de || p.product_name).trim();
  if (!name || !/^\d{8,14}$/.test(p.code ?? "")) return null;
  const brands = Array.isArray(p.brands) ? p.brands.join(",") : p.brands;
  const brand = decode(brands).split(",")[0].trim();
  const unitHint = String(p.product_quantity_unit ?? "").toLowerCase();
  const liquid = ["ml", "l", "cl"].includes(unitHint) || /\b\d+([.,]\d+)?\s?(ml|cl|l)\b/i.test(p.quantity ?? "");
  const sugar = num(n["sugars_100g"]);
  const q = parseQuantity(p.quantity);
  // Die Such-API liefert keine Portionsangaben: bei Mehrfachpackungen dient die Einzelgröße als „Stück“.
  const serving = num(p.serving_quantity) ?? q.each;
  const servingOk = serving && serving > 0 && serving < 2000;
  const servingName = p.serving_size ? portionLabel(p.serving_size) : q.each ? "Stück" : null;
  const pack = num(p.product_quantity) ?? q.pack;
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
    servingOk ? r1(serving) : null,
    servingOk ? servingName : null,
    pack && pack > 0 && pack <= 1000 ? r1(pack) : null,
  ];
}

async function input() {
  const local = process.argv[2];
  if (local) return createReadStream(local).pipe(createGunzip());
  const res = await fetch(DUMP, { headers: { "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`Export nicht erreichbar (HTTP ${res.status})`);
  return Readable.fromWeb(res.body).pipe(createGunzip());
}

// Zeilenweise lesen mit Gegendruck (readline puffert sonst den ganzen Export im Speicher).
async function* lines(stream) {
  let rest = "";
  for await (const chunk of stream.setEncoding("utf8")) {
    const parts = (rest + chunk).split("\n");
    rest = parts.pop();
    yield* parts;
  }
  if (rest) yield rest;
}

let col = null;
let total = 0;
const found = new Map(); // ean → { row, scans }
for await (const line of lines(await input())) {
  const f = line.split("\t");
  if (!col) {
    col = Object.fromEntries(f.map((name, i) => [name, i]));
    continue;
  }
  if (++total % 500_000 === 0) console.log(`${total} Zeilen gelesen, ${found.size} Produkte aus Deutschland`);
  if (!f[col.countries_tags]?.includes("en:germany")) continue;
  const get = (k) => f[col[k]];
  const p = {
    code: get("code"),
    product_name: get("product_name"),
    brands: get("brands"),
    quantity: get("quantity"),
    serving_size: get("serving_size"),
    serving_quantity: get("serving_quantity"),
    product_quantity: get("product_quantity"),
    nutriments: {
      "energy-kcal_100g": get("energy-kcal_100g"),
      "energy-kj_100g": get("energy-kj_100g"),
      energy_100g: get("energy_100g"),
      proteins_100g: get("proteins_100g"),
      carbohydrates_100g: get("carbohydrates_100g"),
      fat_100g: get("fat_100g"),
      sugars_100g: get("sugars_100g"),
    },
  };
  // Ohne Makros ist ein Eintrag für die Suche wenig wert.
  if (num(p.nutriments.proteins_100g) === undefined && num(p.nutriments.carbohydrates_100g) === undefined) continue;
  // Kopieren: Teilstrings halten sonst die ganze (lange) CSV-Zeile im Speicher.
  const mapped = map(p);
  const row = mapped && JSON.parse(JSON.stringify(mapped));
  if (!row) continue;
  const scans = num(get("unique_scans_n")) ?? 0;
  const prev = found.get(row[0]);
  if (!prev || scans > prev.scans) found.set(row[0], { row, scans });
}

// Gleiches Produkt unter mehreren EANs (gleicher Name, Marke, kcal) nur einmal aufnehmen.
const dupKey = (r) => `${r[1]}|${r[2]}|${r[3]}`.toLowerCase();
const seenDup = new Set();
const rows = [...found.values()]
  .sort((a, b) => b.scans - a.scans)
  .filter((x) => !seenDup.has(dupKey(x.row)) && seenDup.add(dupKey(x.row)))
  .slice(0, LIMIT)
  .map((x) => x.row);
console.log(`${total} Zeilen, ${found.size} passende Produkte, ${rows.length} übernommen`);

if (rows.length < 5000) throw new Error(`Nur ${rows.length} Produkte – Datei wird nicht überschrieben.`);
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), products: rows }));
console.log(`Fertig: ${rows.length} Produkte nach ${OUT.pathname}`);
