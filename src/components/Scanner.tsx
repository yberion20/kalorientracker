import { BarcodeDetector, setZXingModuleOverrides } from "barcode-detector/ponyfill";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { useEffect, useRef, useState } from "react";

// Die WebAssembly-Datei mit ausliefern statt vom CDN laden – so geht der Scanner auch offline.
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
});

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

export function Scanner({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);
  const cbRef = useRef(onDetected);
  cbRef.current = onDetected;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new BarcodeDetector({ formats: [...FORMATS] });
    // Treffer zweimal hintereinander bestätigen, um Fehllesungen zu vermeiden.
    let last = "";

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Die Kamera ist in diesem Browser nicht verfügbar.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const name = (e as Error).name;
        setError(
          name === "NotAllowedError"
            ? "Kein Kamerazugriff. Bitte den Zugriff erlauben (iPhone: Einstellungen › Safari › Kamera)."
            : "Die Kamera konnte nicht gestartet werden.",
        );
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
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
      if (stopped || doneRef.current) return;
      raf = requestAnimationFrame(loop);
      const v = videoRef.current;
      const now = performance.now();
      if (busy || !v || v.readyState < 2 || now - lastScan < 120) return;
      busy = true;
      lastScan = now;
      try {
        const codes = await detector.detect(v);
        const value = codes.find((c) => /^\d{8,14}$/.test(c.rawValue))?.rawValue;
        if (value) {
          if (value === last && !doneRef.current) {
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
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) return <div className="notice error">{error}</div>;
  return (
    <div className="scanner">
      <video ref={videoRef} muted playsInline />
      <div className="frame" />
      <div className="hint">{ready ? "Barcode in den Rahmen halten" : "Kamera startet …"}</div>
    </div>
  );
}
