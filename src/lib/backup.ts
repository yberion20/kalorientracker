import { db, saveSettings } from "../db";

const TABLES = ["foods", "entries", "savedMeals", "weights", "water", "health", "settings"] as const;

export async function exportBackup(): Promise<Blob> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  // Den API-Key nicht in die Datei schreiben.
  data.settings = (data.settings as Record<string, unknown>[]).map(({ apiKey: _omit, ...rest }) => rest);
  const payload = { app: "kalorientracker", version: 1, exportedAt: new Date().toISOString(), data };
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
}

export async function shareOrDownloadBackup() {
  const blob = await exportBackup();
  const name = `kalorien-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      await saveSettings({ lastBackupAt: Date.now() });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await saveSettings({ lastBackupAt: Date.now() });
}

export async function importBackup(file: File) {
  const payload = JSON.parse(await file.text());
  if (payload?.app !== "kalorientracker" || !payload.data) throw new Error("Das ist keine Backup-Datei dieser App.");
  const keepKey = (await db.settings.get("main"))?.apiKey;
  await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = payload.data[t];
      if (Array.isArray(rows) && rows.length) await db.table(t).bulkPut(rows);
    }
  });
  if (keepKey) await saveSettings({ apiKey: keepKey });
}
