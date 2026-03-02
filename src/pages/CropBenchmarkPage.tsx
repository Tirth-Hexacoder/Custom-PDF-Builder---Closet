import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import imageList from "../data/imageList.json";
import { cropImageWhitespaceByPixels } from "../utils/pixelWhitespaceCrop";

type ListImageEntry = {
  url?: string;
};

type BrowserDirectoryHandle = {
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | BufferSource | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

type BenchmarkRow = {
  index: number;
  url: string;
  status: "pending" | "running" | "done" | "error";
  elapsedMs?: number;
  processingMs?: number;
  encodeMs?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  blobBytes?: number;
  error?: string;
};

const OUTPUT_MIME_TYPE = "image/jpeg";
const OUTPUT_FORMAT_LABEL = "JPEG";
const OUTPUT_QUALITY = 0.9;

function formatMs(ms: number) {
  return `${ms.toFixed(2)} ms`;
}

function sanitizeFileName(rawName: string) {
  return rawName.replace(/[<>:"/\\|?*]+/g, "_").replace(/\s+/g, " ").trim();
}

function getOutputFileName(url: string, index: number) {
  const raw = url.split("/").pop() || `image-${index + 1}`;
  const decoded = decodeURIComponent(raw);
  const clean = sanitizeFileName(decoded.replace(/\.[^.]+$/, ""));
  return `${String(index + 1).padStart(3, "0")}-${clean || "image"}-cropped.jpg`;
}

async function saveBlobToDirectory(handle: BrowserDirectoryHandle, fileName: string, blob: Blob) {
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export function CropBenchmarkPage() {
  const urls = useMemo(
    () =>
      (imageList as ListImageEntry[])
        .map((item) => item.url)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    []
  );

  const [rows, setRows] = useState<BenchmarkRow[]>(
    urls.map((url, index) => ({ index, url, status: "pending" }))
  );
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [totalMs, setTotalMs] = useState<number | null>(null);
  const [outputFolderName, setOutputFolderName] = useState<string | null>(null);
  const startRef = useRef<number | null>(null);
  const outputDirRef = useRef<BrowserDirectoryHandle | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (startRef.current !== null) {
        setElapsedMs(performance.now() - startRef.current);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [running]);

  const completedCount = useMemo(
    () => rows.filter((row) => row.status === "done" || row.status === "error").length,
    [rows]
  );
  const doneRows = useMemo(() => rows.filter((row) => row.status === "done"), [rows]);
  const avgMs = useMemo(() => {
    if (doneRows.length === 0) return null;
    return doneRows.reduce((sum, row) => sum + (row.elapsedMs ?? 0), 0) / doneRows.length;
  }, [doneRows]);

  const pickOutputFolder = async () => {
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<BrowserDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      window.alert("Directory picker is not supported in this browser. Use latest Chrome/Edge.");
      return;
    }
    try {
      const handle = await picker();
      outputDirRef.current = handle;
      setOutputFolderName(handle.name || "(selected)");
    } catch {
      // user cancelled; keep previous handle if it exists
    }
  };

  const runBenchmark = async () => {
    if (running) return;
    const initialRows = urls.map((url, index) => ({ index, url, status: "pending" as const }));
    setRows(initialRows);
    setElapsedMs(0);
    setTotalMs(null);

    setRunning(true);
    const startedAt = performance.now();
    startRef.current = startedAt;
    let processedOnlyMs = 0;

    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index];
      setRows((prev) =>
        prev.map((row) => (row.index === index ? { ...row, status: "running", error: undefined } : row))
      );

      try {
        const result = await cropImageWhitespaceByPixels(url, {
          output: "blob",
          whiteThreshold: 248,
          alphaThreshold: 8,
          paddingPx: 4,
          mimeType: OUTPUT_MIME_TYPE,
          quality: OUTPUT_QUALITY
        });
        processedOnlyMs += result.elapsedMs;

        if (outputDirRef.current && result.blob) {
          const fileName = getOutputFileName(url, index);
          await saveBlobToDirectory(outputDirRef.current, fileName, result.blob);
        }

        setRows((prev) =>
          prev.map((row) =>
            row.index === index
              ? {
                  ...row,
                  status: "done",
                  elapsedMs: result.elapsedMs,
                  processingMs: result.processingMs,
                  encodeMs: result.encodeMs,
                  sourceWidth: result.sourceWidth,
                  sourceHeight: result.sourceHeight,
                  outputWidth: result.outputWidth,
                  outputHeight: result.outputHeight,
                  blobBytes: result.blob?.size
                }
              : row
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setRows((prev) =>
          prev.map((row) => (row.index === index ? { ...row, status: "error", error: message } : row))
        );
      }
    }

    const finishedAt = performance.now();
    const total = finishedAt - startedAt;
    startRef.current = null;
    setElapsedMs(total);
    setTotalMs(processedOnlyMs);
    setRunning(false);
  };

  return (
    <section className="crop-benchmark-page">
      <header className="crop-benchmark-header">
        <h1>Pixel-Based Crop Benchmark ({OUTPUT_FORMAT_LABEL})</h1>
        <div className="crop-benchmark-actions">
          <button className="run-benchmark-btn" onClick={pickOutputFolder} disabled={running}>
            Pick Output Folder
          </button>
          <button className="run-benchmark-btn" onClick={runBenchmark} disabled={running}>
            {running ? "Running..." : `Run ${OUTPUT_FORMAT_LABEL} Benchmark`}
          </button>
          <Link className="back-link-btn" to="/">
            Back To App
          </Link>
        </div>
      </header>

      <div className="crop-benchmark-summary">
        <div>Total images: {urls.length}</div>
        <div>Processed: {completedCount}</div>
        <div>Elapsed: {formatMs(elapsedMs)}</div>
        <div>Total time: {totalMs === null ? "-" : formatMs(totalMs)}</div>
        <div>Avg/image: {avgMs === null ? "-" : formatMs(avgMs)}</div>
        <div>
          Output folder: {outputFolderName ?? `Not selected (will not save ${OUTPUT_FORMAT_LABEL} files)`}
        </div>
      </div>

      <div className="crop-benchmark-table-wrap">
        <table className="crop-benchmark-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Image URL</th>
              <th>Time</th>
              <th>Process</th>
              <th>{OUTPUT_FORMAT_LABEL} Encode</th>
              <th>Source</th>
              <th>Cropped ({OUTPUT_FORMAT_LABEL})</th>
              <th>Blob Size</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.index}-${row.url}`}>
                <td>{row.index + 1}</td>
                <td>{row.status}</td>
                <td className="url-cell">{row.url}</td>
                <td>{row.elapsedMs === undefined ? "-" : formatMs(row.elapsedMs)}</td>
                <td>{row.processingMs === undefined ? "-" : formatMs(row.processingMs)}</td>
                <td>{row.encodeMs === undefined ? "-" : formatMs(row.encodeMs)}</td>
                <td>
                  {row.sourceWidth && row.sourceHeight ? `${row.sourceWidth}x${row.sourceHeight}` : "-"}
                </td>
                <td>
                  {row.outputWidth && row.outputHeight ? `${row.outputWidth}x${row.outputHeight}` : "-"}
                </td>
                <td>{row.blobBytes === undefined ? "-" : `${(row.blobBytes / 1024).toFixed(1)} KB`}</td>
                <td>{row.error ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
