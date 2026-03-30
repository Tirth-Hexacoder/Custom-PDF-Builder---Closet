import type { ProposalDocumentSnapshot } from "../types";
import { API_BASE_URL } from "../config/env";

type FetchOptions = Omit<RequestInit, "body" | "method">;

// Removes any trailing slashes so URL joining behaves consistently.
function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

// Joins `baseUrl` and `path` into a single absolute URL.
function joinUrl(baseUrl: string, path: string) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

// Returns the backend API base URL (controlled via `VITE_API_BASE_URL`).
export function getApiBaseUrl() {
  return normalizeBaseUrl(API_BASE_URL);
}

// Builds the REST path for a specific project's closet record.
function buildClosetPath(projectId: string, closetId: string) {
  return `/project/${encodeURIComponent(projectId)}/closet/${encodeURIComponent(closetId)}`;
}

// Runs a fetch against the configured API base URL.
async function apiFetch(path: string, init: RequestInit) {
  const url = joinUrl(getApiBaseUrl(), path);
  return fetch(url, init);
}

// Loads the closet state from the backend datastore.
export async function fetchCloset(projectId: string, closetId: string, options: FetchOptions = {}) {
  const res = await apiFetch(buildClosetPath(projectId, closetId), {
    ...options,
    cache: options.cache ?? "no-store",
    headers: {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      ...(options.headers || {})
    }
  });
  return res;
}

// Persists the current document snapshot for a closet.
export async function saveClosetSnapshot(projectId: string, closetId: string, snapshot: ProposalDocumentSnapshot) {
  const res = await apiFetch(`${buildClosetPath(projectId, closetId)}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonPayload: snapshot })
  });
  return res;
}

// Uploads the exported PDF (and snapshot metadata) to the backend.
export async function exportClosetPdf(
  projectId: string,
  closetId: string,
  snapshot: ProposalDocumentSnapshot,
  pdfBlob: Blob
) {
  const formData = new FormData();
  formData.append("jsonPayload", JSON.stringify(snapshot));
  formData.append("pdf", pdfBlob, "export.pdf");

  const res = await apiFetch(`${buildClosetPath(projectId, closetId)}/export`, {
    method: "POST",
    body: formData
  });
  return res;
}
