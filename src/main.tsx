import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import { Root } from "./state/Root";
import type { ProposalDocumentSnapshot } from "./types";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

function resolveInitialDocument(): ProposalDocumentSnapshot | null {
  const params = new URLSearchParams(window.location.search);
  const urlData = params.get("data") || params.get("snapshot") || "";
  if (urlData) {
    try {
      const decoded = decodeURIComponent(urlData);
      const parsed = JSON.parse(decoded) as ProposalDocumentSnapshot;
      console.log("[ReviewPlugin] Loaded snapshot from URL param:", parsed);
      return parsed;
    } catch {
      // ignore; fallback to globals
    }
  }

  const sceneUrl = params.get("sceneUrl") || params.get("returnTo") || "";
  if (sceneUrl && window.sessionStorage) {
    try {
      window.sessionStorage.setItem("review_plugin_scene_url", sceneUrl);
    } catch {
      // ignore
    }
  }

  const globals = window as Window & {
    __REVIEW_PLUGIN_INITIAL_DOCUMENT__?: unknown;
    __PDF_BUILDER_INITIAL_DOCUMENT__?: unknown;
  };
  const globalValue = globals.__REVIEW_PLUGIN_INITIAL_DOCUMENT__ ?? globals.__PDF_BUILDER_INITIAL_DOCUMENT__;
  if (!globalValue) return null;
  if (typeof globalValue === "string") {
    try {
      return JSON.parse(globalValue) as ProposalDocumentSnapshot;
    } catch {
      return null;
    }
  }
  return globalValue as ProposalDocumentSnapshot;
}

const initialDocument = resolveInitialDocument();

ReactDOM.createRoot(rootElement).render(
  <BrowserRouter>
    <Routes>
      <Route
        path="/"
        element={
          <Root initialDocument={initialDocument}>
            <App />
          </Root>
        }
      />
    </Routes>
  </BrowserRouter>
);
