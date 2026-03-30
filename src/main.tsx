import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import { Root } from "./state/Root";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <BrowserRouter>
    <Routes>
      <Route
        path="/"
        element={
          <Root>
            <App />
          </Root>
        }
      />
    </Routes>
  </BrowserRouter>
);
