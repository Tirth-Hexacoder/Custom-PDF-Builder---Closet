import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Root } from "./state/Root";
import type { ProposalDocumentSnapshot } from "./types";
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
    <Root initialDocument={initialDocument}>
      <App />
    </Root>
);
