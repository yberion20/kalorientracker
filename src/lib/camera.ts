/**
 * Gemeinsamer Kamerazugriff für die ganze App.
 *
 * iOS fragt bei Home-Bildschirm-Web-Apps oft bei jedem neuen getUserMedia-Aufruf erneut
 * nach der Kamera-Erlaubnis. Deshalb wird der einmal freigegebene Stream wiederverwendet:
 * Beim Schließen des Kamera-Tabs wird er nur pausiert und erst nach einer Weile ohne
 * Nutzung (oder wenn die App in den Hintergrund geht) wirklich beendet.
 */

const KEEP_ALIVE_MS = 3 * 60_000;

let stream: MediaStream | null = null;
let pending: Promise<MediaStream> | null = null;
let stopTimer = 0;

const isLive = (s: MediaStream | null) => !!s && s.getVideoTracks().some((t) => t.readyState === "live");

export async function acquireCamera(): Promise<MediaStream> {
  clearTimeout(stopTimer);
  if (isLive(stream)) {
    stream!.getTracks().forEach((t) => (t.enabled = true));
    return stream!;
  }
  pending ??= navigator.mediaDevices
    .getUserMedia({
      // Hohe Auflösung, damit Barcodes auch im Hochformat (schmales Bild) genug Pixel haben.
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    .then((s) => (stream = s))
    .finally(() => (pending = null));
  return pending;
}

/** Kamera pausieren; nach KEEP_ALIVE_MS ohne erneute Nutzung ganz freigeben. */
export function releaseCamera() {
  stream?.getTracks().forEach((t) => (t.enabled = false));
  clearTimeout(stopTimer);
  stopTimer = window.setTimeout(stopCamera, KEEP_ALIVE_MS);
}

export function stopCamera() {
  clearTimeout(stopTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

// Im Hintergrund beendet iOS die Kamera ohnehin – dann sauber aufräumen.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && stream && !stream.getTracks().some((t) => t.enabled)) stopCamera();
});
