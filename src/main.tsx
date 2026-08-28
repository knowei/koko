import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StickyDesktopWidget } from "./components/StickyDesktopWidget";
import { StoreSyncBridge } from "./components/StoreSyncBridge";
import { ConfirmDialogProvider } from "./components/ConfirmDialog";
import "./styles.css";

const isStickyWindow = new URLSearchParams(window.location.search).get("mode") === "sticky";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfirmDialogProvider>
      <StoreSyncBridge>
        {isStickyWindow ? <StickyDesktopWidget /> : <App />}
      </StoreSyncBridge>
    </ConfirmDialogProvider>
  </React.StrictMode>,
);
