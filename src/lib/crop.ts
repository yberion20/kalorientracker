/**
 * Bereich des Kamerabilds, den die Vorschau mit `object-fit: cover` tatsächlich zeigt
 * (mittig, Überstand links/rechts bzw. oben/unten abgeschnitten).
 */
export function visibleRegion(videoW: number, videoH: number, boxW: number, boxH: number) {
  if (!boxW || !boxH) return { sx: 0, sy: 0, sw: videoW, sh: videoH };
  const scale = Math.max(boxW / videoW, boxH / videoH);
  const sw = Math.min(videoW, boxW / scale);
  const sh = Math.min(videoH, boxH / scale);
  return { sx: (videoW - sw) / 2, sy: (videoH - sh) / 2, sw, sh };
}
