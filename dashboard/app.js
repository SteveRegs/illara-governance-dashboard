// app.js — ESM

import { loadDashboard, setFilterOptions, getFilterOptions } from "./ui.js?v=20251117a";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=es2022&bundle";

// 1) Read ENV injected by env.public.js
const CFG = window.ENV || window.ILLARA_ENV;

if (!CFG || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
  console.error("ENV check failed:", {
    hasENV: !!CFG,
    keys: CFG && Object.keys(CFG),
  });
  throw new Error("ENV not loaded or missing keys: include env.public.js before app.js");
}

// 2) Create client + expose for quick console-tests
export const supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// Make it globally reachable as a fallback for ui.js and console probes
window.supabase = supabase;

console.log("[DEBUG] created supabase", {
  present: !!supabase,
  hasFrom: !!(window.supabase && window.supabase.from),
  envKeys: window.ENV ? Object.keys(window.ENV) : [],
});

// 3) (optional) Hook helpers (nice for manual console use)
window.loadDashboard = () => loadDashboard(window.supabase);
window.setFilterOptions = setFilterOptions;
window.getFilterOptions = getFilterOptions;

// 4) Kick off UI (with friendly console-on-failure)
loadDashboard(window.supabase).catch((e) => {
  console.error("Dashboard load error:", e);
  // Optional: wire a visible callout later if we want UX feedback.
  // const callout = document.querySelector("#failSpan");
  // if (callout) callout.textContent = e.message || String(e);
});
