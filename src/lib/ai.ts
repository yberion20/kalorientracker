import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 – beste Schätzung (~1–2 ct/Foto)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 – schnell & günstiger" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 – am günstigsten" },
];

const ItemSchema = z.object({
  name: z.string().describe("Kurzer deutscher Name des Lebensmittels, z. B. 'Vollkornbrot' oder 'Spaghetti Bolognese'"),
  amount: z.number().describe("Geschätzte gegessene Menge in Gramm bzw. Milliliter"),
  unit: z.enum(["g", "ml"]),
  kcal_per_100: z.number(),
  protein_per_100: z.number(),
  carbs_per_100: z.number(),
  fat_per_100: z.number(),
  confidence: z.enum(["hoch", "mittel", "niedrig"]),
});

const ResultSchema = z.object({
  items: z.array(ItemSchema),
  notes: z.string().describe("Kurzer Hinweis auf Annahmen oder Unsicherheiten, auf Deutsch, max. 2 Sätze. Leer, wenn keine."),
});

export type AiItem = z.infer<typeof ItemSchema>;
export type AiResult = z.infer<typeof ResultSchema>;

const SYSTEM = `Du bist ein Ernährungsassistent in einer Kalorien-Tracking-App.
Zerlege die Mahlzeit in einzelne Lebensmittel bzw. Komponenten und schätze für jede:
- die gegessene Menge in g (feste Lebensmittel) oder ml (Getränke),
- die Nährwerte pro 100 g/ml (kcal, Eiweiß, Kohlenhydrate, Fett) nach typischen deutschen Nährwerttabellen.
Regeln:
- Nennt der Nutzer Mengen ("2 Scheiben", "ein großer Teller", "200 g"), rechne diese in g/ml um.
- Ohne Mengenangabe nimm eine übliche Portion an.
- Auf Fotos schätze die Menge anhand von Tellergröße, Besteck und Verpackungen. Sichtbare Öle, Saucen und Dressings als eigene Position aufführen.
- Ist eine Verpackung mit Nährwerttabelle lesbar, übernimm die Werte pro 100 g/ml exakt von dort.
- Gemischte Gerichte (z. B. Lasagne) als eine Position, wenn sich die Komponenten nicht sinnvoll trennen lassen.
- Ist auf dem Bild kein Essen zu sehen, gib eine leere Liste zurück und erkläre es in notes.
Antworte ausschließlich auf Deutsch.`;

function client(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 90_000 });
}

type Content = Anthropic.Beta.BetaContentBlockParam[];

async function run(apiKey: string, model: string, content: Content): Promise<AiResult> {
  // Haiku hat keinen serverseitigen Fallback; Opus/Sonnet bekommen ihn, falls eine Anfrage abgelehnt wird.
  const withFallback = !model.startsWith("claude-haiku");
  try {
    const res = await client(apiKey).beta.messages.parse({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(ResultSchema) },
      messages: [{ role: "user", content }],
      ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (res.stop_reason === "refusal") throw new Error("Die KI hat die Anfrage abgelehnt. Versuch es mit einer anderen Beschreibung.");
    if (res.stop_reason === "max_tokens") throw new Error("Die Antwort war zu lang. Bitte die Mahlzeit in kleinere Teile aufteilen.");
    if (!res.parsed_output) throw new Error("Die KI-Antwort konnte nicht gelesen werden. Bitte nochmal versuchen.");
    return res.parsed_output;
  } catch (e) {
    throw new Error(describeError(e));
  }
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Der API-Key ist ungültig. Bitte in den Einstellungen prüfen.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Der API-Key hat keine Berechtigung für dieses Modell.";
  if (e instanceof Anthropic.RateLimitError) return "Zu viele Anfragen oder Guthaben aufgebraucht. Bitte kurz warten bzw. Guthaben in der Anthropic-Konsole prüfen.";
  if (e instanceof Anthropic.BadRequestError) {
    const msg = e.message.toLowerCase();
    if (msg.includes("credit") || msg.includes("balance")) return "Kein Guthaben mehr auf dem Anthropic-Konto.";
    return `Anfrage abgelehnt: ${e.message}`;
  }
  if (e instanceof Anthropic.APIConnectionError) return "Keine Internetverbindung zur KI.";
  if (e instanceof Anthropic.APIError) return `KI-Fehler ${e.status ?? ""}: ${e.message}`;
  return (e as Error)?.message || "Unbekannter Fehler bei der KI-Anfrage.";
}

export function analyzeText(apiKey: string, model: string, text: string) {
  return run(apiKey, model, [{ type: "text", text: `Das habe ich gegessen:\n${text}` }]);
}

export function analyzePhoto(apiKey: string, model: string, jpegBase64: string, hint?: string) {
  return run(apiKey, model, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpegBase64 } },
    {
      type: "text",
      text: `Was ist auf diesem Foto zu sehen? Schätze Lebensmittel, Mengen und Nährwerte.${hint ? `\nZusatzinfo vom Nutzer: ${hint}` : ""}`,
    },
  ]);
}

/** Prüft den API-Key mit einer minimalen Anfrage. */
export async function testKey(apiKey: string, model: string): Promise<void> {
  try {
    await client(apiKey).messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: "Antworte nur mit OK." }],
    });
  } catch (e) {
    throw new Error(describeError(e));
  }
}

/** Verkleinert ein Foto auf max. 1280 px Kantenlänge und gibt JPEG-Base64 (ohne Prefix) zurück. */
export async function fileToJpegBase64(file: File, maxSide = 1280): Promise<{ base64: string; previewUrl: string }> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img;
  });
  const w = "width" in bitmap ? bitmap.width : 0;
  const h = "height" in bitmap ? bitmap.height : 0;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * s);
  canvas.height = Math.round(h * s);
  canvas.getContext("2d")!.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: dataUrl.split(",")[1], previewUrl: dataUrl };
}
