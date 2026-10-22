import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AiPanel } from "../components/AiPanel";
import { AmountSheet, defaultAmount, sourceLabel } from "../components/AmountSheet";
import { CustomFoodForm, QuickAddForm } from "../components/CustomFoodForm";
import { Scanner } from "../components/Scanner";
import { FoodThumb, Sheet } from "../components/ui";
import { type SavedMeal, db, ensureFood, snapshotOf } from "../db";
import { type FoodSnapshot, fmt, scale, sum } from "../lib/nutrition";
import { OffError, lookupBarcode, searchOff } from "../lib/off";

export type AddItems = (items: { food: FoodSnapshot; amount: number }[]) => void | Promise<void>;

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

  const add = async (items: { food: FoodSnapshot; amount: number }[], msg?: string) => {
    await onAdd(items);
    setToast(msg ?? (items.length === 1 ? `${items[0].food.name} hinzugefügt` : `${items.length} Einträge hinzugefügt`));
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "search", label: "🔎 Suche" },
    { id: "scan", label: "▥ Scannen" },
    { id: "ai", label: "✨ KI" },
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

      {tab === "search" && <SearchTab onPick={setPicked} />}
      {tab === "scan" && <ScanTab onPick={setPicked} />}
      {tab === "ai" && <AiPanel goToSettings={goToSettings} onAdd={(items) => add(items)} />}
      {tab === "meals" && <SavedMealsTab onAdd={add} />}
      {tab === "custom" && <CustomTab onPick={setPicked} onQuick={(f) => add([{ food: f, amount: 100 }])} />}

      <AmountSheet
        food={picked}
        onClose={() => setPicked(null)}
        onConfirm={async (amount) => {
          const f = picked!;
          setPicked(null);
          await add([{ food: f, amount }]);
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

function SearchTab({ onPick }: { onPick: (f: FoodSnapshot) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSnapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"recent" | "fav" | "custom">("recent");
  const [retry, setRetry] = useState(0);

  const local = useLiveQuery(async () => {
    const all = await db.foods.toArray();
    return all;
  }, []);

  const query = q.trim().toLowerCase();
  const localMatches = useMemo(() => {
    if (!local) return [];
    if (query) {
      return local
        .filter((f) => `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(query))
        .sort((a, b) => b.favorite - a.favorite || b.useCount - a.useCount)
        .slice(0, 15);
    }
    if (filter === "fav") return local.filter((f) => f.favorite).sort((a, b) => a.name.localeCompare(b.name));
    if (filter === "custom") return local.filter((f) => f.source === "custom").sort((a, b) => a.name.localeCompare(b.name));
    return local
      .filter((f) => f.lastUsedAt > 0)
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, 30);
  }, [local, query, filter]);

  useEffect(() => {
    setResults(null);
    setError(null);
    if (query.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchOff(query, ctrl.signal));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 900);
    return () => {
      clearTimeout(t);
      ctrl.abort();
      setLoading(false);
    };
  }, [query, retry]);

  return (
    <div>
      <input
        className="input"
        type="search"
        placeholder="Lebensmittel suchen …"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        enterKeyHint="search"
      />

      {!query && (
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
      )}

      {localMatches.length > 0 && (
        <>
          <div className="section-title">{query ? "Meine Lebensmittel" : ""}</div>
          <FoodList foods={localMatches} onPick={onPick} />
        </>
      )}
      {!query && localMatches.length === 0 && (
        <div className="empty small">
          {filter === "fav"
            ? "Noch keine Favoriten. Tippe beim Hinzufügen auf ☆."
            : filter === "custom"
              ? "Noch keine eigenen Lebensmittel."
              : "Hier erscheinen deine zuletzt gegessenen Lebensmittel."}
        </div>
      )}

      {query.length >= 3 && (
        <>
          <div className="section-title row between">
            <span>Open Food Facts</span>
            {loading && <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
          </div>
          {error && (
            <div className="notice error">
              {error}
              <div style={{ marginTop: 8 }}>
                <button className="btn small" onClick={() => setRetry((r) => r + 1)}>
                  Nochmal suchen
                </button>
              </div>
            </div>
          )}
          {results && results.length === 0 && <div className="empty small">Nichts gefunden.</div>}
          {results && results.length > 0 && <FoodList foods={results} onPick={onPick} />}
        </>
      )}
      {query.length > 0 && query.length < 3 && <div className="empty small">Mindestens 3 Buchstaben für die Online-Suche.</div>}
    </div>
  );
}

function FoodList({ foods, onPick }: { foods: FoodSnapshot[]; onPick: (f: FoodSnapshot) => void }) {
  return (
    <div className="list">
      {foods.map((f, i) => (
        <button key={`${f.ean ?? f.name}-${i}`} className="list-item" onClick={() => onPick(snapshotOf(f))}>
          <FoodThumb imageUrl={f.imageUrl} source={f.source} />
          <div className="grow">
            <div className="ellipsis" style={{ fontWeight: 600 }}>
              {"favorite" in f && (f as { favorite: number }).favorite ? "★ " : ""}
              {f.name}
            </div>
            <div className="small muted ellipsis">
              {[f.brand, `${fmt(f.per100.kcal)} kcal / 100 ${f.unit}`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <span className="add-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            +
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- Scannen ----------

function ScanTab({ onPick }: { onPick: (f: FoodSnapshot) => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [state, setState] = useState<"scan" | "loading" | "notfound" | "error">("scan");
  const [msg, setMsg] = useState("");
  const [scanKey, setScanKey] = useState(0);

  const handle = useCallback(
    async (ean: string) => {
      setCode(ean);
      setState("loading");
      // Zuerst lokal (offline-fähig, auch eigene Lebensmittel mit EAN).
      const local = await db.foods.where("ean").equals(ean).first();
      if (local) {
        setState("scan");
        setScanKey((k) => k + 1);
        onPick(snapshotOf(local));
        return;
      }
      try {
        const food = await lookupBarcode(ean);
        await ensureFood(food);
        setState("scan");
        setScanKey((k) => k + 1);
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

  if (state === "notfound" && code) {
    return (
      <div className="stack">
        <div className="notice warn">
          {msg} (EAN {code}). Du kannst es selbst anlegen, beim nächsten Scan wird es dann erkannt.
        </div>
        <CustomFoodForm
          initial={{ ean: code }}
          onSave={async (f) => {
            await ensureFood(f);
            setState("scan");
            setScanKey((k) => k + 1);
            onPick(f);
          }}
        />
        <button className="btn block" onClick={() => setState("scan")}>
          Erneut scannen
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      {state === "scan" && <Scanner key={scanKey} onDetected={handle} />}
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
            <button className="btn small" onClick={() => setState("scan")}>
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

function SavedMealsTab({ onAdd }: { onAdd: (items: { food: FoodSnapshot; amount: number }[], msg?: string) => void }) {
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
                  m.items.map((i) => ({ food: i.food, amount: i.amount * factor })),
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

export { defaultAmount, sourceLabel };
