import { type ReactNode, useRef, useState } from "react";

const ACTION_W = 88;

/**
 * Zeile, die sich nach links wischen lässt (wie in iOS-Listen):
 * kurzer Wisch zeigt „Löschen“, langer Wisch löscht direkt.
 */
export function SwipeRow({ children, onDelete }: { children: ReactNode; onDelete: () => void }) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const g = useRef({ x: 0, y: 0, start: 0, mode: "idle" as "idle" | "pending" | "h" | "v", moved: false });

  const settle = (to: number) => {
    setAnimating(true);
    setOffset(to);
  };

  const remove = () => {
    const w = rowRef.current?.offsetWidth ?? 400;
    settle(-w);
    setTimeout(onDelete, 180);
  };

  return (
    <div className="swipe-row" ref={rowRef}>
      <button
        className="swipe-action"
        style={{ width: Math.max(ACTION_W, -offset) }}
        onClick={remove}
        tabIndex={offset ? 0 : -1}
        aria-label="Löschen"
      >
        Löschen
      </button>
      <div
        className="swipe-content"
        style={{ transform: `translateX(${offset}px)`, transition: animating ? "transform 0.18s ease-out" : "none" }}
        onTransitionEnd={() => setAnimating(false)}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          g.current = { x: e.clientX, y: e.clientY, start: offset, mode: "pending", moved: false };
        }}
        onPointerMove={(e) => {
          const s = g.current;
          if (s.mode === "idle" || s.mode === "v") return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (s.mode === "pending") {
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
              s.mode = "h";
              s.moved = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } else if (Math.abs(dy) > 8) {
              s.mode = "v";
              return;
            } else return;
          }
          const w = rowRef.current?.offsetWidth ?? 400;
          setAnimating(false);
          setOffset(Math.min(0, Math.max(-w, s.start + dx)));
        }}
        onPointerUp={() => {
          const s = g.current;
          const wasH = s.mode === "h";
          s.mode = "idle";
          if (!wasH) return;
          const w = rowRef.current?.offsetWidth ?? 400;
          if (offset < -w * 0.55) remove();
          else if (offset < -ACTION_W / 2) settle(-ACTION_W);
          else settle(0);
        }}
        onPointerCancel={() => {
          g.current.mode = "idle";
          settle(offset < -ACTION_W / 2 ? -ACTION_W : 0);
        }}
        onClickCapture={(e) => {
          // Nach einem Wisch kein Antippen auslösen; geöffnete Zeile schließt ein Tipp.
          if (g.current.moved || offset !== 0) {
            e.preventDefault();
            e.stopPropagation();
            g.current.moved = false;
            if (offset !== 0 && !animating) settle(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
