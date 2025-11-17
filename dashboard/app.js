// app.js — ESM

import {
  loadDashboard,
  setFilterOptions,
  getFilterOptions,
} from "./ui.js?v=20251117a";

// 1) Read ENV injected by env.public.js and pin it on window.ILLARA_CFG
const CFG = window.ILLARA_CFG || window.ENV || window.ILLARA_ENV;

if (!CFG || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
  console.error("[APP] ENV check failed:", {
    hasENV: !!CFG,
    keys: CFG ? Object.keys(CFG) : [],
  });
  throw new Error(
    "[APP] ENV not loaded or missing keys: include env.public.js before app.js"
  );
}

// Make this the single source of truth for the dashboard
window.ILLARA_CFG = CFG;

console.log("[APP] ENV ready –", {
  supabaseUrl: CFG.SUPABASE_URL,
  hasKey: !!CFG.SUPABASE_ANON_KEY,
});

// 2) Expose helpers to the console for manual use
window.setFilterOptions = setFilterOptions;
window.getFilterOptions = getFilterOptions;
// ui.js will call getCfg() internally, so we don't need to pass cfg here
window.loadDashboard = () => loadDashboard();

// 3) Kick off initial load
loadDashboard().catch((e) => {
  console.error("Dashboard load error –", e);
});
