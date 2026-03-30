export type AuthContext = {
  token: string;
  projectId: string;
  closetId: string;
};

const SESSION_TOKEN_KEY = "pdf_builder_auth_token_v1";

function getExpectedAuthToken() {
  return String((import.meta as any).env?.VITE_PDF_BUILDER_AUTH_TOKEN || "dummy_auth_token_42");
}

function readTokenFromSession(): string {
  try {
    return window.sessionStorage?.getItem(SESSION_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function persistTokenToSession(token: string) {
  try {
    window.sessionStorage?.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

function readTokenFromWindowName(): string {
  const raw = String(window.name || "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as any;
    const token = parsed?.pdfBuilderAuthToken || parsed?.token || "";
    return typeof token === "string" ? token : "";
  } catch {
    return "";
  }
}

export function readAuthContextFromUrl(search: string = window.location.search):
  | { ok: true; ctx: AuthContext }
  | { ok: false; error: string } {
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const closetId = params.get("closetId") || "";
  const token = readTokenFromSession() || readTokenFromWindowName();
  if (token) persistTokenToSession(token);

  if (!token) return { ok: false, error: "Missing auth token." };
  if (token !== getExpectedAuthToken()) return { ok: false, error: "Invalid auth token." };
  if (!projectId) return { ok: false, error: "Missing projectId." };
  if (!closetId) return { ok: false, error: "Missing closetId." };

  return { ok: true, ctx: { token, projectId, closetId } };
}
