export const BENCHMARK_OUTPUT_MIME_TYPE = "image/jpeg";
export const BENCHMARK_OUTPUT_FORMAT_LABEL = "JPEG";
export const BENCHMARK_OUTPUT_QUALITY = 0.9;

// Format timing values consistently across benchmark summary and table.
export function formatBenchmarkMs(ms: number) {
  return `${ms.toFixed(2)} ms`;
}

function sanitizeFileName(rawName: string) {
  return rawName.replace(/[<>:"/\\|?*]+/g, "_").replace(/\s+/g, " ").trim();
}

// Build deterministic output filename for each benchmark image result.
export function getBenchmarkOutputFileName(url: string, index: number) {
  const raw = url.split("/").pop() || `image-${index + 1}`;
  const decoded = decodeURIComponent(raw);
  const clean = sanitizeFileName(decoded.replace(/\.[^.]+$/, ""));
  return `${String(index + 1).padStart(3, "0")}-${clean || "image"}-cropped.jpg`;
}

