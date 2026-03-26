import { useState } from "react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { EditorTab } from "./components/editor/EditorTab";
import { ExportTab } from "./components/editor/ExportTab";
import { PluginBridge } from "./integration/PluginBridge";
import { useStore } from "./state/Root";
import { saveLatestSnapshotToIdb } from "./utils/idbSnapshotTransport";
import type { AppTab, TabId } from "./types";

const tabs: AppTab[] = [
  { id: "editor", label: "Editor" },
  { id: "download", label: "Download" }
];

export default function App() {
  const store = useStore();
  const [activeTab, setActiveTab] = useState<TabId>("editor");

  const activeIndex = tabs.findIndex(t => t.id === activeTab);
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Scene";

  const goNext = () => {
    const nextIndex = Math.min(activeIndex + 1, tabs.length - 1);
    const nextTab = tabs[nextIndex].id;
    setActiveTab(nextTab);
  };

  const goPrev = () => {
    const prevIndex = Math.max(activeIndex - 1, 0);
    setActiveTab(tabs[prevIndex].id);
  };

  const goToSceneForCapture = () => {
    try {
      const snapshot = store.toDocumentSnapshot();
      void saveLatestSnapshotToIdb(snapshot).then(() => {
        const sceneUrlBase =
          window.sessionStorage?.getItem("review_plugin_scene_url") ||
          (import.meta as any).env?.VITE_SCENE_URL ||
          "http://localhost:5174/";
        const sep = sceneUrlBase.includes("?") ? "&" : "?";
        const editorUrl = encodeURIComponent(window.location.origin + window.location.pathname);
        const params = new URLSearchParams(window.location.search);
        const projectId = params.get("projectId") || store.projectId;
        const closetId = params.get("closetId") || "";

        window.location.href = `${sceneUrlBase}${sep}projectId=${projectId}&closetId=${closetId}`;
      });
    } catch (error) {
      console.warn("[ReviewPlugin] Failed to redirect to scene", error);
      toast.error("Failed to open scene.");
    }
  };

  return (
    <div className="app-shell">
      <PluginBridge />
      <Toaster position="top-center" />
      <header className="topbar">
        <div className="brand">
          <img src="https://modularstudio.modularclosets-apps.com/design/assets/logo/logo2.svg" alt="Modular Closets" />
        </div>

        <div className="topbar-center">
          {activeTab === "editor" && (
            <div className="toolbar-nav-center">
              <button className="nav-center-btn" onClick={goToSceneForCapture}>
                <i className="fa-solid fa-chevron-left"></i> Scene View
              </button>
              <div className="toolbar-divider"></div>
              <button className="nav-center-btn" onClick={goNext}>
                Download <i className="fa-solid fa-chevron-right"></i>
              </button>
            </div>
          )}
        </div>

        <div className="meta">
          {activeTab === "editor" && (
            <>
              <button
                className="pill-item"
                onClick={async () => {
                  const saved = store.saveSnapshot();
                  try {
                    const snapshot = store.toDocumentSnapshot();
                    console.log("[Save] Snapshot built:", { pages: snapshot.pages?.length, images: snapshot.images?.length });
                    
                    const params = new URLSearchParams(window.location.search);
                    const projectId = params.get("projectId");
                    const closetId = params.get("closetId");
                    
                    if (projectId && closetId) {
                      const res = await fetch(`http://localhost:4000/api/project/${projectId}/closet/${closetId}/save`, {
                         method: "POST",
                         headers: { "Content-Type": "application/json" },
                         body: JSON.stringify({ jsonPayload: snapshot })
                      });
                      if (res.ok) {
                        toast.success("Saved to Datastore!");
                      } else {
                        const errText = await res.text();
                        console.error("[Save] Backend error:", res.status, errText);
                        toast.error(`Save failed: ${res.status}`);
                      }
                    } else {
                      void saveLatestSnapshotToIdb(snapshot);
                      if (saved) toast.success("Data saved locally.");
                    }
                  } catch (error) {
                    console.error("[Save] Exception:", error);
                    toast.error("Failed to save.");
                  }
                }}
                type="button"
              >
                <span className="pill-text">Save</span>
              </button>
              <button className="pill-item" onClick={goToSceneForCapture} type="button">
                <span className="pill-text">Add / Edit Scene</span>
              </button>
            </>
          )}
          <div className="pill-item">
            <span className="pill-text">{activeTabLabel}</span>
          </div>
        </div>
      </header>

      <div className="main-wrapper">

        {activeTab === "download" && (
          <button className="corner-nav-btn bottom-left" onClick={goPrev}>
            &larr; Go Back to Editing
          </button>
        )}

        <main className={`content ${activeTab === "editor" ? "full-width" : ""}`}>
          <div style={{ display: activeTab === "editor" ? "block" : "none", width: "100%", height: "100%" }}>
            <EditorTab />
          </div>
          {activeTab === "download" && <ExportTab />}
        </main>
      </div>

    </div>
  );
}
