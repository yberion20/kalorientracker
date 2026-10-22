import { useEffect, useState } from "react";
import { type Fasting, fastingStatus, formatDuration } from "../lib/nutrition";

/** Zeigt im Tagebuch, ob gerade Essens- oder Fastenzeit ist. */
export function FastingStatusCard({ fasting }: { fasting: Fasting }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    const onVis = () => document.visibilityState === "visible" && setNow(new Date());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const s = fastingStatus(fasting, now);
  const eating = s.phase === "eat";
  return (
    <div className="card">
      <div className="row between">
        <h3>{eating ? "🍽️ Essenszeit" : "🌙 Fastenzeit"}</h3>
        <span className="small muted">
          {fasting.eatStart}–{fasting.eatEnd} Uhr
        </span>
      </div>
      <div className="fasting-bar">
        <div style={{ width: `${Math.round(s.progress * 100)}%`, background: eating ? "var(--accent)" : "var(--protein)" }} />
      </div>
      <div className="small">
        {eating ? "Essensfenster schließt" : "Fasten endet"} in <b>{formatDuration(s.minutesLeft)}</b>{" "}
        <span className="muted">(um {s.nextChange} Uhr)</span>
      </div>
    </div>
  );
}
