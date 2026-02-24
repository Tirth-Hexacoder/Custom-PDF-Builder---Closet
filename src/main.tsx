import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Root } from "./state/Root";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Root>
      <App />
    </Root>
  </React.StrictMode>
);
