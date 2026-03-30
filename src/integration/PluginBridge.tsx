import { useEffect } from "react";
import { useStore } from "../state/Root";
import type { ProposalDocumentSnapshot } from "../types";
import type { AuthContext } from "../auth";
import { fetchCloset } from "../api/backend";
import { downloadSnapshotJson, exportStoreAsPdf } from "../utils/downloadTab/documentAdapter";

type ReviewPluginApi = {
  load: (snapshot: ProposalDocumentSnapshot) => boolean;
  getSnapshot: () => ProposalDocumentSnapshot;
  exportPdf: () => Promise<void>;
  downloadJson: () => void;
};

// Bridge for embedding this app as a plugin (e.g. in an iframe).
// Host can read `window.__REVIEW_PLUGIN_API__` to load/save/export without changing editor behavior.
export function PluginBridge({ auth }: { auth: AuthContext }) {
  const store = useStore();

  useEffect(() => {
    let cancelled = false;

    const loadFromBackend = async (isFocusEvent = false) => {
      try {
        if (!isFocusEvent) console.log("[ReviewPlugin] Fetching network project state...");
        const res = await fetchCloset(auth.projectId, auth.closetId, {
          headers: { Authorization: `Bearer ${auth.token}` }
        });
        if (!res.ok) {
          console.warn("[ReviewPlugin] Backend error:", res.status);
          return;
        }
        const data = (await res.json()) as any;
        if (!data?.success) return;
        if (cancelled) return;

        store.projectId = auth.projectId;

        const savedImgs = data.hasSavedJson ? (data.jsonPayload?.images || []) : [];
        const rawDbImgs = data.images || [];
        const mergedImgsMap = new Map<string, any>();
        savedImgs.forEach((img: any) => { if (img?.id) mergedImgsMap.set(String(img.id), img); });
        rawDbImgs.forEach((img: any) => { if (img?.id) mergedImgsMap.set(String(img.id), img); });
        const dbImgs = Array.from(mergedImgsMap.values());

        if (isFocusEvent) {
          const currentIds = new Set(store.images.map((img) => String(img.id)));
          const newImgs = dbImgs.filter((img: any) => img?.id && !currentIds.has(String(img.id)));
          if (newImgs.length > 0) {
            console.log(`[ReviewPlugin] Soft refresh: Merged ${newImgs.length} new images into tray.`);
            store.images.push(...newImgs);
            store.appendDefaultPagesForImages(newImgs);
          }
          return;
        }

        if (data.hasSavedJson && data.jsonPayload) {
          store.importSnapshot({
            ...data.jsonPayload,
            images: dbImgs
          });

          const usedIds = new Set((data.jsonPayload.images || []).map((i: any) => String(i?.id || "")));
          const brandNewImgs = dbImgs.filter((img: any) => img?.id && !usedIds.has(String(img.id)));
          if (brandNewImgs.length > 0) {
            store.appendDefaultPagesForImages(brandNewImgs);
          }
        } else {
          store.importSnapshot({ images: dbImgs, pages: [] });
        }
      } catch (error) {
        console.warn("[ReviewPlugin] Failed loading snapshot from backend", error);
      }
    };

    const handleFocusOrVisible = () => {
      if (document.visibilityState === "visible") void loadFromBackend(true);
    };

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    void loadFromBackend(false);

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
      cancelled = true;
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      window.removeEventListener("message", onMessage);
      try {
        delete (window as Window & { __REVIEW_PLUGIN_API__?: ReviewPluginApi }).__REVIEW_PLUGIN_API__;
      } catch {
        (window as Window & { __REVIEW_PLUGIN_API__?: ReviewPluginApi }).__REVIEW_PLUGIN_API__ = undefined;
      }
    };
  }, [store, auth.projectId, auth.closetId, auth.token]);

  return null;
}
