import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AiPanel, PhotoAnalysis } from "../components/AiPanel";
import { AmountSheet, sourceLabel } from "../components/AmountSheet";
import { CustomFoodForm, QuickAddForm } from "../components/CustomFoodForm";
import { type CapturedPhoto, Scanner } from "../components/Scanner";
import { FoodThumb, Sheet } from "../components/ui";
import { type Food, type SavedMeal, db, ensureFood, foodKey, snapshotOf } from "../db";
import { type FoodSnapshot, type PortionChoice, type Selection, fmt, formatAmount, scale, sum } from "../lib/nutrition";
import { genericItems, loadCatalog, normalize, searchItems } from "../lib/catalog";
import { OffError, lookupBarcode, searchOff } from "../lib/off";

export type AddItem = { food: FoodSnapshot; amount: number; portion?: PortionChoice };
export type AddItems = (items: AddItem[]) => void | Promise<void>;

type Tab = "search" | "scan" | "ai" | "meals" | "custom";

export function AddFood({
  open,
  title,
  onClose,
  onAdd,
  withSavedMeals = true,
  goToSettings,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onAdd: AddItems;
  withSavedMeals?: boolean;
  goToSettings?: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} full>
      <AddFoodBody onAdd={onAdd} withSavedMeals={withSavedMeals} goToSettings={goToSettings} />
    </Sheet>
  );
}

function AddFoodBody({ onAdd, withSavedMeals, goToSettings }: { onAdd: AddItems; withSavedMeals: boolean; goToSettings?: () => void }) {
  const [tab, setTab] = useState<Tab>("search");
  const [picked, setPicked] = useState<FoodSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const add = async (items: AddItem[], msg?: string) => {
    await onAdd(items);
    setToast(msg ?? (items.length === 1 ? `${items[0].food.name} hinzugefügt` : `${items.length} Einträge hinzugefügt`));
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "search", label: "🔎 Suche" },
    { id: "scan", label: "📷 Kamera" },
    { id: "ai", label: "✨ Beschreiben" },
    ...(withSavedMeals ? [{ id: "meals" as Tab, label: "🍱 Mahlzeiten" }] : []),
    { id: "custom", label: "✏️ Eigenes" },
  ];

  return (
    <>
      <div className="segment" style={{ marginBottom: 14 }}>
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <SearchTab
          onPick={setPicked}
          onQuickAdd={(f, sel) => add([{ food: snapshotOf(f), amount: sel.amount, portion: sel.portion }], `${f.name}: ${formatAmount(sel.amount, f.unit, sel.portion)}`)}
        />
      )}
      {tab === "scan" && <CameraTab onPick={setPicked} onAdd={(items) => add(items)} goToSettings={goToSettings} />}
      {tab === "ai" && <AiPanel goToSettings={goToSettings} onAdd={(items) => add(items)} />}
      {tab === "meals" && <SavedMealsTab onAdd={add} />}
      {tab === "custom" && <CustomTab onPick={setPicked} onQuick={(f) => add([{ food: f, amount: 100 }])} />}

      <AmountSheet
        food={picked}
        onClose={() => setPicked(null)}
        onConfirm={async (sel) => {
          const f = picked!;
          setPicked(null);
          await add([{ food: f, amount: sel.amount, portion: sel.portion }]);
        }}
      />

      {toast && (
        <div className="update-banner" style={{ bottom: "calc(var(--safe-bottom) + 20px)", zIndex: 60 }}>
          ✓ {toast}
        </div>
      )}
    </>
  );
}

// ---------- Suche ----------

type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

function SearchTab({ onPick, onQuickAdd }: { onPick: (f: FoodSnapshot) => void; onQuickAdd: (f: Food, sel: Selection) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"recent" | "fav" | "custom">("recent");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [online, setOnline] = useState<{ query: string; results: FoodSnapshot[] | null; error: string | null } | null>(null);
  const deferred = useDeferredValue(q);

  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch(() => setCatalogError(true));
  }, []);

  const local = useLiveQuery(() => db.foods.toArray(), []);

  const query = deferred.trim();
  const nq = normalize(query);
  const localMatches = useMemo(() => {
    if (!local) return [];
    if (nq) {
      const tokens = nq.split(/\s+/);
      return local
        .filter((f) => {
          const hay = normalize(`${f.name} ${f.brand ?? ""}`);
          return tokens.every((t) => hay.includes(t));
        })
        .sort((a, b) => b.favorite - a.favorite || b.useCount - a.useCount)
        .slice(0, 10);
    }
    if (filter === "fav") return local.filter((f) => f.favorite).sort((a, b) => a.name.localeCompare(b.name));
    if (filter === "custom") return local.filter((f) => f.source === "custom").sort((a, b) => a.name.localeCompare(b.name));
    return local
      .filter((f) => f.lastUsedAt > 0)
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, 30);
  }, [local, nq, filter]);

  const ownKeys = useMemo(() => new Set(localMatches.map((f) => foodKey(f))), [localMatches]);

  const genericMatches = useMemo(() => {
    if (!nq) return [];
    return searchItems(genericItems(), query, 8).filter((f) => !ownKeys.has(foodKey(f)));
  }, [nq, query, ownKeys]);

  const catalogMatches = useMemo(() => {
    if (!catalog || !nq) return [];
    return searchItems(catalog, query, 40).filter((f) => !ownKeys.has(foodKey(f)));
  }, [catalog, nq, query, ownKeys]);

  const searchOnline = async () => {
    const qq = query;
    setOnline({ query: qq, results: null, error: null });
    try {
      const results = await searchOff(qq);
      setOnline((o) => (o?.query === qq ? { query: qq, results, error: null } : o));
    } catch (e) {
      setOnline((o) => (o?.query === qq ? { query: qq, results: null, error: (e as Error).message } : o));
    }
  };

  const onlineForQuery = online && online.query === query ? online : null;

  return (
    <div>
      <input
        className="input"
        type="search"
        placeholder="Lebensmittel suchen …"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {!query && (
        <>
          <div className="row" style={{ margin: "12px 0 0", gap: 6 }}>
            <button className={`chip${filter === "recent" ? " active" : ""}`} onClick={() => setFilter("recent")}>
              Zuletzt
            </button>
            <button className={`chip${filter === "fav" ? " active" : ""}`} onClick={() => setFilter("fav")}>
              ★ Favoriten
            </button>
            <button className={`chip${filter === "custom" ? " active" : ""}`} onClick={() => setFilter("custom")}>
              Eigene
            </button>
          </div>
          {localMatches.length > 0 ? (
            <>
              <div className="section-title" />
              <FoodList foods={localMatches} onPick={onPick} onQuickAdd={onQuickAdd} />
            </>
          ) : (
            <div className="empty small">
              {filter === "fav"
                ? "Noch keine Favoriten. Tippe beim Hinzufügen auf ☆."
                : filter === "custom"
                  ? "Noch keine eigenen Lebensmittel."
                  : "Hier erscheinen deine zuletzt gegessenen Lebensmittel."}
            </div>
          )}
        </>
      )}

      {query && (
        <>
          {localMatches.length > 0 && (
            <>
              <div className="section-title">Meine Lebensmittel</div>
              <FoodList foods={localMatches} onPick={onPick} onQuickAdd={onQuickAdd} />
            </>
          )}
          {genericMatches.length > 0 && (
            <>
              <div className="section-title">Grundnahrungsmittel</div>
              <FoodList foods={genericMatches} onPick={onPick} />
            </>
          )}
          <div className="section-title row between">
            <span>Markenprodukte</span>
            {!catalog && !catalogError && <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
          </div>
          {!catalog && !catalogError && (
            <div className="empty small">Produktliste wird geladen … (beim ersten Mal ca. 8 MB, danach offline verfügbar)</div>
          )}
          {catalogError && <div className="notice error">Die Produktliste konnte nicht geladen werden. Bitte mit Internet einmal neu öffnen.</div>}
          {catalog && catalogMatches.length === 0 && <div className="empty small">Keine Treffer in der Produktliste.</div>}
          {catalogMatches.length > 0 && <FoodList foods={catalogMatches} onPick={onPick} />}

          {query.length >= 3 && (
            <div style={{ marginTop: 14 }}>
              {!onlineForQuery && (
                <button className="btn block" onClick={searchOnline}>
                  🌐 Nicht dabei? Online in allen Produkten suchen
                </button>
              )}
              {onlineForQuery && (
                <>
                  <div className="section-title row between">
                    <span>Open Food Facts online</span>
                    {!onlineForQuery.results && !onlineForQuery.error && (
                      <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    )}
                  </div>
                  {onlineForQuery.error && (
                    <div className="notice error">
                      {onlineForQuery.error}
                      <div style={{ marginTop: 8 }}>
                        <button className="btn small" onClick={searchOnline}>
                          Nochmal versuchen
                        </button>
                      </div>
                    </div>
                  )}
                  {onlineForQuery.results?.length === 0 && <div className="empty small">Auch online nichts gefunden.</div>}
                  {onlineForQuery.results && onlineForQuery.results.length > 0 && (
                    <FoodList foods={onlineForQuery.results} onPick={onPick} />
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FoodList({
  foods,
  onPick,
  onQuickAdd,
}: {
  foods: (FoodSnapshot | Food)[];
  onPick: (f: FoodSnapshot) => void;
  onQuickAdd?: (f: Food, sel: Selection) => void;
}) {
  return (
    <div className="list">
      {foods.map((f, i) => {
        const rec = "id" in f ? (f as Food) : undefined;
        // Favoriten nutzen ihre feste Menge, sonst die zuletzt gegessene.
        const sel = rec ? (rec.favorite ? (rec.preferred ?? rec.lastSelection) : rec.lastSelection) : undefined;
        const quick = !!(sel && onQuickAdd && rec);
        return (
          <div key={`${f.ean ?? f.name}-${i}`} className="list-item" role="button" onClick={() => onPick(snapshotOf(f))}>
            <FoodThumb imageUrl={f.imageUrl} source={f.source} />
            <div className="grow">
              <div className="ellipsis" style={{ fontWeight: 600 }}>
                {rec?.favorite ? "★ " : ""}
                {f.name}
              </div>
              <div className="small muted ellipsis">
                {sel
                  ? `${formatAmount(sel.amount, f.unit, sel.portion)} · ${fmt(scale(f.per100, sel.amount).kcal)} kcal`
                  : f.source === "generic" && f.portions?.[0]
                    ? `1 ${f.portions[0].label} (${fmt(f.portions[0].amount)} ${f.unit}) · ${fmt(scale(f.per100, f.portions[0].amount).kcal)} kcal`
                    : [f.brand, `${fmt(f.per100.kcal)} kcal / 100 ${f.unit}`].filter(Boolean).join(" · ")}
              </div>
            </div>
            <button
              className="add-btn"
              aria-label={quick ? "Mit gemerkter Menge hinzufügen" : "Menge wählen"}
              onClick={(e) => {
                e.stopPropagation();
                if (quick) onQuickAdd!(rec!, sel!);
                else onPick(snapshotOf(f));
              }}
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Kamera: Barcode oder Foto für die KI ----------

function CameraTab({
  onPick,
  onAdd,
  goToSettings,
}: {
  onPick: (f: FoodSnapshot) => void;
  onAdd: (items: { food: FoodSnapshot; amount: number }[]) => void;
  goToSettings?: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [state, setState] = useState<"live" | "loading" | "notfound" | "error" | "custom">("live");
  const [msg, setMsg] = useState("");
  const [tip, setTip] = useState<string | null>(null);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [camKey, setCamKey] = useState(0);

  const backToCamera = (t: string | null = null) => {
    setTip(t);
    setState("live");
    setCamKey((k) => k + 1);
  };

  const handle = useCallback(
    async (ean: string) => {
      setCode(ean);
      setTip(null);
      setState("loading");
      // Zuerst lokal (offline-fähig, auch eigene Lebensmittel mit EAN).
      const local = await db.foods.where("ean").equals(ean).first();
      if (local) {
        backToCamera();
        onPick(snapshotOf(local));
        return;
      }
      try {
        const food = await lookupBarcode(ean);
        await ensureFood(food);
        backToCamera();
        onPick(food);
      } catch (e) {
        if (e instanceof OffError && e.kind !== "network") {
          setState("notfound");
          setMsg(e.message);
        } else {
          setState("error");
          setMsg((e as Error).message);
        }
      }
    },
    [onPick],
  );

  if (photo)
    return (
      <PhotoAnalysis
        photo={photo}
        onAdd={onAdd}
        goToSettings={goToSettings}
        onDone={() => {
          setPhoto(null);
          backToCamera();
        }}
      />
    );

  if (state === "notfound" && code)
    return (
      <div className="stack">
        <div className="notice warn">
          {msg} (EAN {code})
        </div>
        <button
          className="btn primary block"
          onClick={() => backToCamera("Fotografiere das Produkt – am besten mit lesbarer Nährwerttabelle – und tippe auf den Auslöser.")}
        >
          📸 Foto aufnehmen, KI schätzt die Werte
        </button>
        <button className="btn block" onClick={() => setState("custom")}>
          ✏️ Selbst anlegen
        </button>
        <button className="btn block" onClick={() => backToCamera()}>
          Erneut scannen
        </button>
      </div>
    );

  if (state === "custom" && code)
    return (
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          Beim nächsten Scan von EAN {code} wird das Lebensmittel dann erkannt.
        </p>
        <CustomFoodForm
          initial={{ ean: code }}
          onSave={async (f) => {
            await ensureFood(f);
            backToCamera();
            onPick(f);
          }}
        />
        <button className="btn block" onClick={() => backToCamera()}>
          Abbrechen
        </button>
      </div>
    );

  return (
    <div className="stack">
      {tip && <div className="notice">{tip}</div>}
      {state === "live" && (
        <Scanner key={camKey} onDetected={handle} onCapture={setPhoto}>
          <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
            Barcode wird automatisch erkannt. Für Essen ohne Barcode: Auslöser tippen, die KI analysiert das Foto.
          </p>
        </Scanner>
      )}
      {state === "loading" && (
        <div className="card row" style={{ justifyContent: "center" }}>
          <span className="spinner" /> <span>Suche {code} …</span>
        </div>
      )}
      {state === "error" && (
        <div className="notice error">
          {msg}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => code && handle(code)}>
              Nochmal
            </button>
            <button className="btn small" onClick={() => backToCamera()}>
              Neu scannen
            </button>
          </div>
        </div>
      )}
      <div className="row">
        <input
          className="input grow"
          inputMode="numeric"
          placeholder="EAN manuell eingeben"
          value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
        />
        <button className="btn" disabled={manual.length < 8} onClick={() => handle(manual)}>
          Suchen
        </button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Daten von Open Food Facts (frei, von der Community gepflegt). Werte bitte kurz prüfen.
      </p>
    </div>
  );
}

// ---------- Gespeicherte Mahlzeiten ----------

export function mealTotal(m: SavedMeal) {
  return sum(m.items.map((i) => scale(i.food.per100, i.amount)));
}

function SavedMealsTab({ onAdd }: { onAdd: (items: AddItem[], msg?: string) => void }) {
  const meals = useLiveQuery(() => db.savedMeals.orderBy("name").toArray(), []);
  const [sel, setSel] = useState<SavedMeal | null>(null);
  const [factor, setFactor] = useState(1);

  if (!meals) return null;
  if (!meals.length)
    return (
      <div className="empty">
        Noch keine gespeicherten Mahlzeiten.
        <br />
        <span className="small">Im Tagebuch bei einer Mahlzeit auf „Als Mahlzeit speichern“ tippen oder im Tab „Mahlzeiten“ eine anlegen.</span>
      </div>
    );
  return (
    <>
      <div className="list">
        {meals.map((m) => (
          <button
            key={m.id}
            className="list-item"
            onClick={() => {
              setFactor(1);
              setSel(m);
            }}
          >
            <div className="thumb">🍱</div>
            <div className="grow">
              <div style={{ fontWeight: 600 }} className="ellipsis">
                {m.name}
              </div>
              <div className="small muted">
                {m.items.length} Lebensmittel · {fmt(mealTotal(m).kcal)} kcal
              </div>
            </div>
            <span className="add-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              +
            </span>
          </button>
        ))}
      </div>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.name}>
        {sel && (
          <div className="stack">
            <div className="list">
              {sel.items.map((it, i) => (
                <div className="list-item" key={i}>
                  <div className="grow ellipsis">{it.food.name}</div>
                  <span className="muted small">
                    {fmt(it.amount * factor)} {it.food.unit}
                  </span>
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="muted small">Portion:</span>
              {[0.5, 1, 1.5, 2].map((f) => (
                <button key={f} className={`chip${factor === f ? " active" : ""}`} onClick={() => setFactor(f)}>
                  {f.toLocaleString("de-DE")}×
                </button>
              ))}
            </div>
            <div className="muted small">{fmt(mealTotal(sel).kcal * factor)} kcal gesamt</div>
            <button
              className="btn primary block"
              onClick={() => {
                const m = sel;
                setSel(null);
                onAdd(
                  m.items.map((i) => ({
                    food: i.food,
                    amount: i.amount * factor,
                    portion: i.portion ? { ...i.portion, count: i.portion.count * factor } : undefined,
                  })),
                  `${m.name} hinzugefügt`,
                );
              }}
            >
              Alle hinzufügen
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---------- Eigenes / Schnell ----------

function CustomTab({ onPick, onQuick }: { onPick: (f: FoodSnapshot) => void; onQuick: (f: FoodSnapshot) => void }) {
  const [mode, setMode] = useState<"custom" | "quick">("custom");
  const [formKey, setFormKey] = useState(0);
  return (
    <div className="stack">
      <div className="segment">
        <button className={mode === "custom" ? "active" : ""} onClick={() => setMode("custom")}>
          Lebensmittel anlegen
        </button>
        <button className={mode === "quick" ? "active" : ""} onClick={() => setMode("quick")}>
          ⚡ Nur Kalorien
        </button>
      </div>
      <div className="card">
        {mode === "custom" ? (
          <CustomFoodForm
            key={formKey}
            onSave={async (f) => {
              await ensureFood(f);
              setFormKey((k) => k + 1);
              onPick(f);
            }}
          />
        ) : (
          <QuickAddForm
            key={formKey}
            onSave={(f) => {
              setFormKey((k) => k + 1);
              onQuick(f);
            }}
          />
        )}
      </div>
      <p className="muted small">Eigene Lebensmittel findest du später in der Suche unter „Eigene“.</p>
    </div>
  );
}

export { sourceLabel };
