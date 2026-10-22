import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { todayISO } from "./lib/nutrition";
import { Diary } from "./screens/Diary";
import { SavedMeals } from "./screens/SavedMeals";
import { Settings } from "./screens/Settings";
import { Weight } from "./screens/Weight";

type Tab = "diary" | "meals" | "weight" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "diary", label: "Tagebuch", icon: "📖" },
  { id: "meals", label: "Mahlzeiten", icon: "🍱" },
  { id: "weight", label: "Gewicht", icon: "⚖️" },
  { id: "settings", label: "Einstellungen", icon: "⚙️" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("diary");
  const [date, setDate] = useState(todayISO());
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // Wenn die App über Nacht offen bleibt, beim Zurückkehren auf "heute" springen.
  useEffect(() => {
    let lastToday = todayISO();
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const now = todayISO();
      if (now !== lastToday) {
        setDate((d) => (d === lastToday ? now : d));
        lastToday = now;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <div className="app">
      {tab === "diary" && <Diary date={date} setDate={setDate} goToSettings={() => setTab("settings")} />}
      {tab === "meals" && <SavedMeals goToSettings={() => setTab("settings")} />}
      {tab === "weight" && <Weight />}
      {tab === "settings" && <Settings />}

      {needRefresh && (
        <div className="update-banner">
          <span className="grow">Neue Version verfügbar</span>
          <button className="btn small primary" onClick={() => updateServiceWorker(true)}>
            Neu laden
          </button>
        </div>
      )}

      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
              <span className="ico">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
