import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import { Root } from "./state/Root";
import type { ProposalDocumentSnapshot } from "./types";
import { CropBenchmarkPage } from "./pages/CropBenchmarkPage";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

function resolveInitialDocument(): ProposalDocumentSnapshot | null {
  const globalValue = (window as Window & { __PDF_BUILDER_INITIAL_DOCUMENT__?: unknown }).__PDF_BUILDER_INITIAL_DOCUMENT__;
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
      <Route path="/crop-benchmark" element={<CropBenchmarkPage />} />
    </Routes>
  </BrowserRouter>
);
