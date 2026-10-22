import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "./ui";

const ITEM_H = 40;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

interface Option {
  value: number;
  label: string;
}

/** Eine Spalte eines iOS-artigen Wählrads (Scroll-Snap). */
function WheelColumn({
  options,
  value,
  onChange,
  width,
  align = "center",
}: {
  options: Option[];
  value: number;
  onChange: (v: number) => void;
  width?: number | string;
  align?: "left" | "center" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const selfScroll = useRef(false);
  const index = Math.max(
    0,
    options.findIndex((o) => Math.abs(o.value - value) < 1e-9),
  );
  const [pos, setPos] = useState(index * ITEM_H);

  // Von außen gesetzten Wert anfahren (z. B. beim Öffnen).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 2) {
      selfScroll.current = true;
      el.scrollTop = target;
      setPos(target);
    }
  }, [index]);

  const onScroll = () => {
    const el = ref.current!;
    setPos(el.scrollTop);
    if (selfScroll.current) {
      selfScroll.current = false;
      return;
    }
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const i = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
      if (options[i] && Math.abs(options[i].value - value) > 1e-9) onChange(options[i].value);
    }, 90);
  };

  return (
    <div
      ref={ref}
      className="wheel-col"
      style={{ height: ITEM_H * VISIBLE, width, textAlign: align }}
      onScroll={onScroll}
    >
      <div style={{ height: PAD }} />
      {options.map((o, i) => {
        const d = Math.abs(i * ITEM_H - pos) / ITEM_H;
        if (d > VISIBLE) return <div key={o.value} className="wheel-item" />;
        return (
          <div
            key={o.value}
            className="wheel-item"
            style={{
              opacity: Math.max(0.2, 1 - d * 0.32),
              transform: `scale(${Math.max(0.82, 1 - d * 0.07)})`,
              fontWeight: d < 0.5 ? 650 : 400,
            }}
            onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })}
          >
            {o.label}
          </div>
        );
      })}
      <div style={{ height: PAD }} />
    </div>
  );
}

export interface NumberWheelProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  /** Schrittweite; bei 0.1 zeigt das Rad zwei Spalten (Ganzzahl , Nachkommastelle). */
  step?: number;
  unit?: string;
}

const round = (n: number, step: number) => Math.round(n / step) * step;

export function NumberWheel({ value, onChange, min, max, step = 1, unit }: NumberWheelProps) {
  const split = step === 0.1;
  const v = Math.min(max, Math.max(min, round(value, step)));

  const intOptions = useMemo(() => {
    const out: Option[] = [];
    const s = split ? 1 : step;
    for (let n = split ? Math.floor(min) : min; n <= max + 1e-9; n = +(n + s).toFixed(4)) {
      out.push({ value: n, label: n.toLocaleString("de-DE", { maximumFractionDigits: 2 }) });
    }
    return out;
  }, [min, max, step, split]);

  const decOptions = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ value: i, label: String(i) })), []);

  const intPart = split ? Math.floor(v + 1e-9) : v;
  const decPart = split ? Math.round((v - intPart) * 10) : 0;

  return (
    <div className="wheel">
      <div className="wheel-band" />
      {split ? (
        <>
          <WheelColumn
            options={intOptions}
            value={intPart}
            onChange={(n) => onChange(Math.min(max, Math.max(min, +(n + decPart / 10).toFixed(1))))}
            width={90}
            align="right"
          />
          <div className="wheel-sep">,</div>
          <WheelColumn
            options={decOptions}
            value={decPart}
            onChange={(d) => onChange(Math.min(max, Math.max(min, +(intPart + d / 10).toFixed(1))))}
            width={44}
            align="left"
          />
        </>
      ) : (
        <WheelColumn options={intOptions} value={v} onChange={onChange} width={120} />
      )}
      {unit && <div className="wheel-unit">{unit}</div>}
    </div>
  );
}

/** Feld, das wie ein Eingabefeld aussieht und beim Antippen ein Wählrad öffnet. */
export function WheelField({
  label,
  value,
  onChange,
  format,
  optional,
  defaultValue,
  ...wheel
}: Omit<NumberWheelProps, "value" | "onChange"> & {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  format?: (v: number) => string;
  /** Wert darf leer sein (z. B. Zielgewicht). */
  optional?: boolean;
  /** Startwert im Rad, wenn noch nichts gesetzt ist. */
  defaultValue?: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? defaultValue ?? wheel.min);
  const show = (n: number) =>
    format ? format(n) : `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })}${wheel.unit ? ` ${wheel.unit}` : ""}`;

  return (
    <>
      <label className="field">
        <span>{label}</span>
        <button
          type="button"
          className="input wheel-field"
          onClick={() => {
            setDraft(value ?? defaultValue ?? wheel.min);
            setOpen(true);
          }}
        >
          {value === undefined ? <span className="muted">–</span> : show(value)}
          <span className="muted" style={{ fontSize: 12 }}>
            ▾
          </span>
        </button>
      </label>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="stack">
          <NumberWheel {...wheel} value={draft} onChange={setDraft} />
          <button
            className="btn primary block"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
          >
            Übernehmen
          </button>
          {optional && value !== undefined && (
            <button
              className="btn danger block"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              Entfernen
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}
