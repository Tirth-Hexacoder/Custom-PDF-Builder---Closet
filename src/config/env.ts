// Small env/config helpers used across the app.
function normalizeUrl(value: string) {
  return value.trim();
}

// Returns the Scene app URL used when switching to "Scene View".
export function getSceneUrlBase() {
  return (
    window.sessionStorage?.getItem("review_plugin_scene_url") ||
    (import.meta as any).env?.VITE_SCENE_URL ||
    "http://localhost:5174/"
  );
}

// Backend API base URL (used by `src/api/*`).
export const API_BASE_URL = normalizeUrl((import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:4000/api");
