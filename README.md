# Kalorientracker

Eigener Kalorien-Tracker (Yazio-Nachbau) als Web-App fürs iPhone. Du installierst ihn einmal über Safari auf dem Home-Bildschirm. Danach läuft er im Vollbild und offline, ganz ohne App Store oder Entwickler-Account.

## Funktionen

- Tagebuch mit Frühstück, Mittagessen, Abendessen und Snacks, Kalorienring und Makros
- Barcode-Scanner (EAN) mit Lookup in Open Food Facts und Mengeneingabe in g/ml bzw. Portionen
- Suche in Open Food Facts, dazu Favoriten, „Zuletzt“, eigene Lebensmittel und Schnell-Eintrag nur mit kcal
- KI-Modus (Claude): Mahlzeit beschreiben oder diktieren, oder Essen fotografieren. Die Schätzung lässt sich vor dem Übernehmen bearbeiten.
- Gespeicherte Mahlzeiten: anlegen, bearbeiten, mit einem Tipp einfügen (auch ½× oder 2×)
- Gewichtstracker mit Diagramm (7-Tage-Durchschnitt, Zielgewicht)
- Ziele mit Rechner (Mifflin-St Jeor) und frei wählbarer Makro-Verteilung
- Wasser-Tracker
- Apple Health (Schritte, aktive Kalorien) über einen Kurzbefehl, Anleitung in der App
- Backup als JSON-Datei, z. B. in iCloud Drive

Alle Daten liegen lokal auf dem Gerät (IndexedDB). Der Claude-API-Key bleibt ebenfalls nur auf dem Gerät.

## Entwickeln

```bash
npm install
npm run dev        # lokaler Server
npm test           # Unit-Tests
npm run build      # Produktions-Build nach dist/
```

## Veröffentlichen (GitHub Pages)

1. Lege ein Repository auf GitHub an und pushe diesen Ordner auf den Branch `main`.
2. Auf GitHub: **Settings › Pages › Source: GitHub Actions**.
3. Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht die App automatisch unter `https://<benutzer>.github.io/<repo>/`.

## Auf dem iPhone installieren

1. Link in **Safari** öffnen.
2. **Teilen › Zum Home-Bildschirm**.
3. Die App über das neue Icon starten. Updates kommen automatisch, die App zeigt dann „Neue Version, neu laden“.
