import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles/globals.css";
import { App } from "./app/App";
import { migrateLocalData } from "./lib/storage/db";

async function boot() {
  await migrateLocalData().catch(() => undefined);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
