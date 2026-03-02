import { useState } from "react";
import { Link } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { SceneTab } from "./components/scene/SceneTab";
import { EditorTab } from "./components/editor/EditorTab";
import { ExportTab } from "./components/editor/ExportTab";
import type { AppTab, TabId } from "./types";

const tabs: AppTab[] = [
  { id: "scene", label: "Scene" },
  { id: "editor", label: "Editor" },
  { id: "download", label: "Download" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("editor");

  const activeIndex = tabs.findIndex(t => t.id === activeTab);
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Scene";

  const goNext = () => {
    const nextIndex = Math.min(activeIndex + 1, tabs.length - 1);
    setActiveTab(tabs[nextIndex].id);
  };

  const goPrev = () => {
    const prevIndex = Math.max(activeIndex - 1, 0);
    setActiveTab(tabs[prevIndex].id);
  };

  return (
    <div className="app-shell">
      <Toaster position="top-center" />
      <header className="topbar">
        <div className="brand">
          <img src="https://modularstudio.modularclosets-apps.com/design/assets/logo/logo2.svg" alt="Modular Closets" />
        </div>

        <div className="topbar-center">
          {activeTab === "editor" && (
            <div className="toolbar-nav-center">
              <button className="nav-center-btn" onClick={goPrev}>
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
          <Link className="pill-item benchmark-pill-link" to="/crop-benchmark">
            <span className="pill-text">Crop Benchmark</span>
          </Link>
          <div className="pill-item">
            <span className="pill-text">{activeTabLabel}</span>
          </div>
        </div>
      </header>

      <div className={`main-wrapper ${activeTab === "scene" ? "full-screen-scene" : ""}`}>

        {activeTab === "scene" && (
          <button className="corner-nav-btn bottom-right" onClick={goNext}>
            Go To Editor &rarr;
          </button>
        )}

        {activeTab === "download" && (
          <button className="corner-nav-btn bottom-left" onClick={goPrev}>
            &larr; Go Back to Editing
          </button>
        )}

        <main className={`content ${activeTab === "scene" || activeTab === "editor" ? "full-width" : ""}`}>
          <div style={{ display: activeTab === "scene" ? "block" : "none", width: "100%", height: "100%" }}>
            <SceneTab isActive={activeTab === "scene"} />
          </div>
          <div style={{ display: activeTab === "editor" ? "block" : "none", width: "100%", height: "100%" }}>
            <EditorTab />
          </div>
          {activeTab === "download" && <ExportTab />}
        </main>
      </div>

    </div>
  );
}
