import { useState } from "react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { EditorTab } from "./components/editor/EditorTab";
import { ExportTab } from "./components/editor/ExportTab";
import { PluginBridge } from "./integration/PluginBridge";
import { saveClosetSnapshot } from "./api/backend";
import { useStore } from "./state/Root";
import { getSceneUrlBase } from "./config/env";
import { readAuthContextFromUrl } from "./auth";
import type { AppTab, TabId } from "./types";

// Top-level navigation tabs for the app shell.
const tabs: AppTab[] = [
  { id: "editor", label: "Editor" },
  { id: "download", label: "Download" }
];

export default function App() {
  const store = useStore();
  const [activeTab, setActiveTab] = useState<TabId>("editor");
  const authResult = readAuthContextFromUrl();

  if (!authResult.ok) {
    return (
      <div className="app-shell">
        <Toaster position="top-center" />
        <main className="content full-width" style={{ padding: 24 }}>
          <h2 style={{ margin: 0 }}>Access denied</h2>
          <p style={{ marginTop: 12 }}>{authResult.error}</p>
        </main>
      </div>
    );
  }

  const auth = authResult.ctx;

  const activeIndex = tabs.findIndex(t => t.id === activeTab);
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Scene";

  // Moves forward one tab (clamped to the last tab).
  const goNext = () => {
    const nextIndex = Math.min(activeIndex + 1, tabs.length - 1);
    const nextTab = tabs[nextIndex].id;
    setActiveTab(nextTab);
  };

  // Moves back one tab (clamped to the first tab).
  const goPrev = () => {
    const prevIndex = Math.max(activeIndex - 1, 0);
    setActiveTab(tabs[prevIndex].id);
  };

  // Redirects to the Scene app for capture/editing.
  const goToSceneForCapture = () => {
    try {
      const sceneUrlBase = getSceneUrlBase();
      const sep = sceneUrlBase.includes("?") ? "&" : "?";
      const editorUrl = encodeURIComponent(window.location.origin + window.location.pathname);
      window.location.href =
        `${sceneUrlBase}${sep}projectId=${encodeURIComponent(auth.projectId)}&closetId=${encodeURIComponent(auth.closetId)}&editorUrl=${editorUrl}`;
    } catch (error) {
      console.warn("[ReviewPlugin] Failed to redirect to scene", error);
      toast.error("Failed to open scene.");
    }
  };

  return (
    <div className="app-shell">
      <PluginBridge auth={auth} />
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
                onClick={() => window.dispatchEvent(new CustomEvent("pdf-builder:import"))}
                type="button"
              >
                <span className="pill-text">Import</span>
              </button>
              <button
                className="pill-item"
                onClick={async () => {
                  // Saves locally by default, or saves to backend when embedded with project/closet params.
                  try {
                    const snapshot = store.toDocumentSnapshot();
                    console.log("[Save] Snapshot built:", { pages: snapshot.pages?.length, images: snapshot.images?.length });
                    
                    const res = await saveClosetSnapshot(auth.projectId, auth.closetId, snapshot, auth.token);
                    if (res.ok) {
                      toast.success("Saved to Datastore!");
                    } else {
                      const errText = await res.text();
                      console.error("[Save] Backend error:", res.status, errText);
                      toast.error(`Save failed: ${res.status}`);
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
