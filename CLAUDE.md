# Hinweise für Claude

## Arbeitsweise

- Nach jeder fertigen Änderung (gebaut, getestet, auf den Arbeits-Branch gepusht) **immer nachfragen, ob sie auch auf `main` gemergt werden soll**. Erst `main` löst das Deployment auf GitHub Pages aus. Ohne Rückfrage nicht auf `main` pushen.
- Mit dem Nutzer auf Deutsch kommunizieren; Commit-Nachrichten ebenfalls auf Deutsch.

## Projekt

- Web-App (Vite, React, TypeScript, Dexie/IndexedDB), läuft als PWA auf dem iPhone.
- Vor dem Pushen: `npm run typecheck`, `npm test`, `npm run build`.
