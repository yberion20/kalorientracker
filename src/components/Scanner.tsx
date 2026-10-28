import { BarcodeDetector, setZXingModuleOverrides } from "barcode-detector/ponyfill";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { acquireCamera, releaseCamera } from "../lib/camera";

// Die WebAssembly-Datei mit ausliefern statt vom CDN laden – so geht der Scanner auch offline.
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
});

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

export interface CapturedPhoto {
  base64: string;
  previewUrl: string;
}

/**
 * Live-Kamera, die laufend nach Barcodes sucht (in jeder Ausrichtung) und
 * auf Wunsch ein Foto des aktuellen Bildes liefert.
 */
export function Scanner({
  onDetected,
  onCapture,
  paused,
  children,
}: {
  onDetected: (code: string) => void;
  onCapture?: (photo: CapturedPhoto) => void;
  /** Kamera läuft weiter, aber es wird nicht gescannt. */
  paused?: boolean;
  /** Zusätzliche Bedienelemente unter dem Kamerabild. */
  children?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const doneRef = useRef(false);
  const cbRef = useRef(onDetected);
  cbRef.current = onDetected;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new BarcodeDetector({ formats: [...FORMATS] });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // Treffer zweimal hintereinander bestätigen, um Fehllesungen zu vermeiden.
    let last = "";
    let tick = 0;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Die Kamera ist in diesem Browser nicht verfügbar.");
        return;
      }
      try {
        // Einmal freigegebene Kamera wiederverwenden, damit iOS nicht jedes Mal neu fragt.
        stream = await acquireCamera();
      } catch (e) {
        const name = (e as Error).name;
        setError(
          name === "NotAllowedError"
            ? "Kein Kamerazugriff. Bitte beim Nachfragen „Erlauben“ tippen (iPhone: Einstellungen › Apps › Safari › Kamera)."
            : "Die Kamera konnte nicht gestartet werden.",
        );
        return;
      }
      if (stopped) return releaseCamera();
      const v = videoRef.current!;
      v.srcObject = stream;
      v.setAttribute("playsinline", "true");
      await v.play().catch(() => {});
      setReady(true);
      loop();
    }

    let busy = false;
    let lastScan = 0;
    async function loop() {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      const v = videoRef.current;
      const now = performance.now();
      if (doneRef.current || pausedRef.current || busy || !v || v.readyState < 2 || now - lastScan < 110) return;
      busy = true;
      lastScan = now;
      try {
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        // Abwechselnd: quadratischer Ausschnitt in der Mitte (schnell, volle Auflösung) und ganzes Bild.
        let source: CanvasImageSource | ImageData = v;
        if (tick++ % 3 !== 2) {
          const side = Math.round(Math.min(vw, vh) * 0.9);
          canvas.width = side;
          canvas.height = side;
          ctx.drawImage(v, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, side, side);
          source = ctx.getImageData(0, 0, side, side);
        }
        const codes = await detector.detect(source);
        const value = codes.find((c) => /^\d{8,14}$/.test(c.rawValue))?.rawValue;
        if (value) {
          if (value === last && !doneRef.current && !pausedRef.current) {
            doneRef.current = true;
            navigator.vibrate?.(40);
            cbRef.current(value);
          }
          last = value;
        }
      } catch {
        /* einzelne Frames dürfen fehlschlagen */
      } finally {
        busy = false;
      }
    }

    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (videoRef.current) videoRef.current.srcObject = null;
      if (stream) releaseCamera();
    };
  }, []);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !onCapture || v.readyState < 2) return;
    const maxSide = 1280;
    const s = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * s);
    c.height = Math.round(v.videoHeight * s);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const previewUrl = c.toDataURL("image/jpeg", 0.82);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    onCapture({ base64: previewUrl.split(",")[1], previewUrl });
  };

  if (error)
    return (
      <div className="stack">
        <div className="notice error">{error}</div>
        {children}
      </div>
    );
  return (
    <div className="stack">
      <div className="scanner">
        <video ref={videoRef} muted playsInline />
        <div className="frame" />
        {flash && <div className="scanner-flash" />}
        <div className="hint">
          {!ready ? "Kamera startet …" : paused ? "" : onCapture ? "Barcode in den Rahmen halten – oder Foto aufnehmen" : "Barcode in den Rahmen halten"}
        </div>
        {onCapture && ready && (
          <button className="shutter" onClick={capture} aria-label="Foto für KI aufnehmen">
            <span />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
