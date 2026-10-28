import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { type Goals, type Nutrients, fmt } from "../lib/nutrition";

export function Sheet({
  open,
  onClose,
  title,
  children,
  full,
  left,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  full?: boolean;
  left?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  // Per Portal an <body> hängen, damit verschachtelte Sheets sich korrekt überlagern.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${full ? " full" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {(title || left) && (
          <div className="sheet-head">
            {left}
            <h2 className="grow ellipsis">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Schließen">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Ring({ value, max, size = 148, stroke = 12 }: { value: number; max: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const over = value > max && max > 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={over ? "var(--danger)" : "var(--accent)"}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
    </svg>
  );
}

const MACROS = [
  { key: "carbs", label: "Kohlenhydrate", color: "var(--carbs)" },
  { key: "protein", label: "Eiweiß", color: "var(--protein)" },
  { key: "fat", label: "Fett", color: "var(--fat)" },
] as const;

export function MacroBars({ total, goals }: { total: Nutrients; goals: Goals }) {
  return (
    <div className="macros">
      {MACROS.map((m) => {
        const v = total[m.key];
        const g = goals[m.key];
        const pct = g > 0 ? Math.min(v / g, 1) * 100 : 0;
        return (
          <div className="macro" key={m.key}>
            <div className="name">{m.label}</div>
            <div className="bar">
              <div style={{ width: `${pct}%`, background: v > g ? "var(--danger)" : m.color }} />
            </div>
            <div className="val">
              {fmt(v)} / {fmt(g)} g
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NutriGrid({ n }: { n: Nutrients }) {
  return (
    <div className="nutri-grid">
      <div>
        <b>{fmt(n.kcal)}</b>
        <span>kcal</span>
      </div>
      <div>
        <b style={{ color: "var(--carbs)" }}>{fmt(n.carbs, 1)}</b>
        <span>Kohlenh.</span>
      </div>
      <div>
        <b style={{ color: "var(--protein)" }}>{fmt(n.protein, 1)}</b>
        <span>Eiweiß</span>
      </div>
      <div>
        <b style={{ color: "var(--fat)" }}>{fmt(n.fat, 1)}</b>
        <span>Fett</span>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

const SOURCE_ICON = { off: "🏷️", custom: "✏️", ai: "✨", quick: "⚡", generic: "🥗" } as const;

export function FoodThumb({ imageUrl, source }: { imageUrl?: string; source: keyof typeof SOURCE_ICON }) {
  if (imageUrl) return <img className="thumb" src={imageUrl} alt="" loading="lazy" />;
  return <div className="thumb">{SOURCE_ICON[source]}</div>;
}

/** Zahl-Eingabe, die Komma akzeptiert. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  step,
  className = "input",
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
  autoFocus?: boolean;
  step?: string;
  className?: string;
}) {
  const show = (v: number | "") => (v === "" ? "" : String(v).replace(".", ","));
  const [text, setText] = useState(show(value));
  // Externe Änderungen übernehmen, ohne Zwischenzustände wie "12," zu überschreiben.
  useEffect(() => {
    const parsed = parseFloat(text.replace(",", "."));
    if (value === "" ? text !== "" : parsed !== value) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      step={step}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(".", ",").replace(/[^\d,]/g, "").replace(/,(?=.*,)/g, "");
        setText(t);
        if (t === "") return onChange("");
        const n = parseFloat(t.replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
      onFocus={(e) => e.target.select()}
    />
  );
}
