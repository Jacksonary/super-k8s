import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installWebviewGuards } from "./utils/webviewGuards";
import "antd/dist/reset.css";
import "./index.css";

try {
  const saved = localStorage.getItem("super-k8s:theme");
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
} catch {
  document.documentElement.dataset.theme = "dark";
}

installWebviewGuards();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
