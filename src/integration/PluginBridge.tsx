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

    const loadData = async (isFocusEvent = false) => {
      try {
        const projectId = params.get("projectId");
        const closetId = params.get("closetId");

        if (projectId && closetId) {
          if (!isFocusEvent) console.log("[ReviewPlugin] Fetching network project state...");
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

          if (dbData) {
            // Unify image lists to ensure we don't drop older saved images or new unappended DB captures
            const savedImgs = dbData.hasSavedJson ? (dbData.jsonPayload?.images || []) : [];
            const rawDbImgs = dbData.images || [];
            const mergedImgsMap = new Map();
            savedImgs.forEach((img: any) => { if (img.id) mergedImgsMap.set(img.id, img); });
            rawDbImgs.forEach((img: any) => { if (img.id) mergedImgsMap.set(img.id, img); });
            const dbImgs = Array.from(mergedImgsMap.values());
            
            // 1. Soft Refresh: Tab Focus without a pending IDB handoff.
            if (isFocusEvent && !localSnapshot) {
              const currentIds = new Set(store.images.map(img => img.id));
              const newImgs = dbImgs.filter((img: any) => img.id && !currentIds.has(img.id));
              if (newImgs.length > 0) {
                console.log(`[ReviewPlugin] Soft refresh: Merged ${newImgs.length} new images into tray.`);
                store.images.push(...newImgs);
                store.appendDefaultPagesForImages(newImgs);
              }
              return; // Skip full layout reset
            }

            // 2. IDB Handoff: Returning from Scene with unsaved edits.
            if (localSnapshot && localSnapshot.images) {
              console.log("[ReviewPlugin] Found unsaved local IDB payload, bypassing raw DB load.");
              // Merge any new DB images (the newly captured scene) into the local snapshot
              const localIds = new Set(localSnapshot.images.map((img: any) => img.id));
              const newImgs = dbImgs.filter((img: any) => img.id && !localIds.has(img.id));
              if (newImgs.length > 0) {
                console.log(`[ReviewPlugin] Merging ${newImgs.length} fresh DB captures into IDB session limits.`);
                localSnapshot.images.unshift(...newImgs); // Put new images at the top
              }
              store.importSnapshot(localSnapshot);
              if (newImgs.length > 0) {
                store.appendDefaultPagesForImages(newImgs);
              }
            } else {
              // 3. Hard DB Load (Initial Mount with no IDB cache)
              if (dbData.hasSavedJson) {
                store.importSnapshot({
                  ...dbData.jsonPayload,
                  images: dbImgs
                });
                
                // Now that the saved layout is restored, dynamically append any newly discovered captures
                const usedIds = new Set(dbData.jsonPayload.images?.map((i: any) => i.id) || []);
                const brandNewImgs = dbImgs.filter((img: any) => img.id && !usedIds.has(img.id));
                if (brandNewImgs.length > 0) {
                  store.appendDefaultPagesForImages(brandNewImgs);
                }
              } else {
                store.importSnapshot({ images: dbImgs, pages: [] });
              }
            }
          } else if (localSnapshot && localSnapshot.images.length > 0) {
             store.importSnapshot(localSnapshot);
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
      if (document.visibilityState === "visible") loadData(true);
    };

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    // Initial load — runs once on mount
    loadData(false);

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
