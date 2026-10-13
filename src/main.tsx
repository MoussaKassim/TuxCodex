import ReactDOM from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import App from "./App";
import "./styles.css";

function reportError(error: unknown) {
  if (!isTauri()) return;
  const message = error instanceof Error ? `${error.message}\n${error.stack || ""}` : String(error);
  void invoke("report_frontend_error", { message }).catch(() => {});
}

window.addEventListener("error", (event) => reportError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
ReactDOM.createRoot(document.getElementById("root")!, {
  onUncaughtError: reportError,
  onCaughtError: reportError,
  onRecoverableError: reportError,
}).render(<App />);
