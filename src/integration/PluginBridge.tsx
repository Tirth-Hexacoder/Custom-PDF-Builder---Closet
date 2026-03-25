import { useEffect } from "react";
import { useStore } from "../state/Root";
import type { ProposalDocumentSnapshot } from "../types";
import { downloadSnapshotJson, exportStoreAsPdf } from "../utils/downloadTab/documentAdapter";
import { clearLatestSnapshotFromIdb, loadLatestSnapshotFromIdb } from "../utils/idbSnapshotTransport";

type ReviewPluginApi = {
  load: (snapshot: ProposalDocumentSnapshot) => boolean;
  getSnapshot: () => ProposalDocumentSnapshot;
  exportPdf: () => Promise<void>;
  downloadJson: () => void;
  saveToSession: () => boolean;
};

// Bridge for embedding this app as a plugin (e.g. in an iframe).
// Host can read `window.__REVIEW_PLUGIN_API__` to load/save/export without changing editor behavior.
export function PluginBridge() {
  const store = useStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasUrlSnapshot = !!(params.get("data") || params.get("snapshot"));

    const loadData = async () => {
      try {
        const projectId = params.get("projectId");
        const closetId = params.get("closetId");

        if (projectId && closetId) {
          console.log("[ReviewPlugin] Fetching network project state...");
          let dbData = null;
          try {
            const res = await fetch(`http://localhost:4000/api/project/${projectId}/closet/${closetId}`, {
              cache: "no-store",
              headers: {
                "Pragma": "no-cache",
                "Cache-Control": "no-cache"
              }
            });
            if (res.ok) {
              const data = await res.json();
              if (data.success) dbData = data;
            }
          } catch (err) {
            console.warn("[ReviewPlugin] Network unavailable", err);
          }

          // Even with a DB profile, check for unsaved roaming session data from the Scene transition
          const localSnapshot = await loadLatestSnapshotFromIdb();

          if (localSnapshot && localSnapshot.images.length > 0) {
            console.log("[ReviewPlugin] Found unsaved local IDB payload, bypassing raw DB load.");
            store.importSnapshot(localSnapshot);
          } else if (dbData) {
            if (dbData.hasSavedJson) {
              const imgs = dbData.jsonPayload?.images || [];
              console.group("[ReviewPlugin] DB Images (Saved JSON)");
              imgs.forEach((img: any, i: number) => {
                console.log(`[${i}] url: ${img.url || img.blobUrl || img.imageUrl || "(none)"}`);
              });
              console.groupEnd();
              store.importSnapshot(dbData.jsonPayload);
            } else {
              const imgs: any[] = dbData.images || [];
              console.group("[ReviewPlugin] DB Images (Raw)");
              imgs.forEach((img: any, i: number) => {
                console.log(`[${i}] url: ${img.url || img.blobUrl || img.imageUrl || "(none)"}`);
              });
              console.groupEnd();
              store.importSnapshot({ images: imgs, pages: [] });
            }
          }

          await clearLatestSnapshotFromIdb(); // clear stale Local IDB
          return;
        }

        if (hasUrlSnapshot) {
          // Prefer URL-passed snapshot; clear any stale IDB payload.
          await clearLatestSnapshotFromIdb();
          return;
        }
        const snapshot = await loadLatestSnapshotFromIdb();
        if (!snapshot) return;
        console.log("[ReviewPlugin] Loaded snapshot from IndexedDB:", snapshot);
        store.importSnapshot(snapshot);
        await clearLatestSnapshotFromIdb();
      } catch (error) {
        console.warn("[ReviewPlugin] Failed loading snapshot from Backend/IndexedDB", error);
      }
    };

    const handleFocusOrVisible = () => {
      if (document.visibilityState === "visible") loadData();
    };

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    // Initial load
    loadData();

    const api: ReviewPluginApi = {
      load(snapshot) {
        return store.importSnapshot(snapshot);
      },
      getSnapshot() {
        return store.toDocumentSnapshot();
      },
      async exportPdf() {
        await exportStoreAsPdf(store);
      },
      downloadJson() {
        downloadSnapshotJson(store.toDocumentSnapshot());
      },
      saveToSession() {
        return store.saveSnapshot();
      }
    };

    (window as Window & { __REVIEW_PLUGIN_API__?: ReviewPluginApi }).__REVIEW_PLUGIN_API__ = api;
    window.dispatchEvent(new CustomEvent("review-plugin-ready"));

    const onMessage = (event: MessageEvent) => {
      const data = event.data as unknown;
      if (!data || typeof data !== "object") return;
      const msg = data as { type?: string; snapshot?: unknown; requestId?: string };
      if (msg.type === "review-plugin:load" && msg.snapshot) {
        api.load(msg.snapshot as ProposalDocumentSnapshot);
        return;
      }
      if (msg.type === "review-plugin:getSnapshot") {
        event.source?.postMessage(
          { type: "review-plugin:snapshot", requestId: msg.requestId || null, snapshot: api.getSnapshot() },
          { targetOrigin: "*" }
        );
      }
    };

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      window.removeEventListener("message", onMessage);
      try {
        delete (window as Window & { __REVIEW_PLUGIN_API__?: ReviewPluginApi }).__REVIEW_PLUGIN_API__;
      } catch {
        (window as Window & { __REVIEW_PLUGIN_API__?: ReviewPluginApi }).__REVIEW_PLUGIN_API__ = undefined;
      }
    };
  }, [store]);

  return null;
}
