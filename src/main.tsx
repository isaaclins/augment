import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AugmentProvider } from "./state/augment";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AugmentProvider>
      <App />
    </AugmentProvider>
  </React.StrictMode>,
);
