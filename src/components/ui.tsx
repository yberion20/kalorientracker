import { type ReactNode, useEffect, useRef, useState } from "react";
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
    <SheetBody onClose={onClose} title={title} full={full} left={left}>
      {children}
    </SheetBody>,
    document.body,
  );
}

/** Ab dieser Strecke (px) oder mit einem schnellen Wisch nach unten schließt das Sheet. */
const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.6;

/** Liegt der Finger in einem eigenen Scrollbereich (z. B. Zahlenrad), der die Geste selbst braucht? */
function inInnerScroller(target: EventTarget | null, sheet: HTMLElement) {
  for (let el = target as HTMLElement | null; el && el !== sheet; el = el.parentElement) {
    if (el.closest?.(".wheel, [data-no-sheet-drag]")) return true;
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) return true;
  }
  return false;
}

function SheetBody({
  onClose,
  title,
  children,
  full,
  left,
}: {
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  full?: boolean;
  left?: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Tastatur: iOS legt sie über die Seite. Das Sheet auf den sichtbaren Bereich verkleinern
  // und das Eingabefeld in die Mitte holen, damit man die aktuelle Menge sieht.
  useEffect(() => {
    const vv = window.visualViewport;
    const backdrop = backdropRef.current!;
    const sheet = sheetRef.current!;
    const reveal = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && sheet.contains(el) && el.matches("input, textarea")) el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    const fit = () => {
      if (!vv) return;
      const keyboard = window.innerHeight - vv.height > 120;
      backdrop.style.top = keyboard ? `${vv.offsetTop}px` : "";
      backdrop.style.height = keyboard ? `${vv.height}px` : "";
      backdrop.classList.toggle("keyboard", keyboard);
      if (keyboard) requestAnimationFrame(reveal);
    };
    const onFocus = () => setTimeout(reveal, 350);
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    sheet.addEventListener("focusin", onFocus);
    fit();
    return () => {
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      sheet.removeEventListener("focusin", onFocus);
    };
  }, []);

  // Zum Schließen nach unten ziehen – am Griff/Kopf immer, im Inhalt, wenn er oben steht.
  useEffect(() => {
    const sheet = sheetRef.current!;
    let startY = 0;
    let startX = 0;
    let startT = 0;
    let dy = 0;
    let state: "idle" | "maybe" | "drag" | "off" = "idle";

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const onHandle = !!(e.target as HTMLElement).closest(".sheet-grip, .sheet-head");
      if (!onHandle && (sheet.scrollTop > 0 || inInnerScroller(e.target, sheet))) {
        state = "off";
        return;
      }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      startT = Date.now();
      dy = 0;
      state = "maybe";
    };
    const onMove = (e: TouchEvent) => {
      if (state === "off" || state === "idle") return;
      const y = e.touches[0].clientY - startY;
      const x = e.touches[0].clientX - startX;
      if (state === "maybe") {
        if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
        // Waagerecht oder nach oben: normales Scrollen/Wischen.
        if (y <= 0 || Math.abs(x) > Math.abs(y)) {
          state = "off";
          return;
        }
        state = "drag";
        sheet.style.transition = "none";
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      e.preventDefault();
      dy = Math.max(0, y);
      sheet.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (state === "drag") {
        const v = dy / Math.max(1, Date.now() - startT);
        sheet.style.transition = "transform 0.2s ease-out";
        if (dy > CLOSE_DISTANCE || (v > CLOSE_VELOCITY && dy > 30)) {
          sheet.style.transform = "translateY(100%)";
          setTimeout(() => closeRef.current(), 180);
        } else {
          sheet.style.transform = "";
        }
      }
      state = "idle";
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div className="sheet-backdrop" ref={backdropRef} onClick={onClose}>
      <div className={`sheet${full ? " full" : ""}`} ref={sheetRef} onClick={(e) => e.stopPropagation()}>
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
    </div>
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
