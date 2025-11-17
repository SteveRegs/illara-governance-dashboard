// app.js — ESM

import { loadDashboard, setFilterOptions, getFilterOptions } from "./ui.js?v=20251117b";

// 1) Read ENV injected by env.public.js
const CFG = window.ENV || window.ILLARA_ENV;

if (!CFG || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
  console.error("ENV check failed:", {
    hasENV: !!CFG,
    keys: CFG && Object.keys(CFG),
  });
  throw new Error("ENV not loaded or missing keys: include env.public.js before app.js");
}

// 2) Expose config globally for UI + console helpers
window.ILLARA_CFG = CFG;

console.log("[APP] ENV ready", {
  supabaseUrl: CFG.SUPABASE_URL,
  hasKey: !!CFG.SUPABASE_ANON_KEY,
});

// 3) Hook helpers (nice for manual console use)
window.loadDashboard = () => loadDashboard();
window.setFilterOptions = setFilterOptions;
window.getFilterOptions = getFilterOptions;

// 4) Kick off UI (with friendly console-on-failure)
loadDashboard().catch((e) => {
  console.error("Dashboard load error:", e);
  // Later we could show a visible callout if we want.
});
