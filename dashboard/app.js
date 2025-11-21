// app.js — ESM entry for the dashboard

import { loadDashboard, setFilterOptions, getFilterOptions } from "./ui.js?v=20251118a";

// 1) Read ENV injected by env.public.js
const CFG =
  window.ILLARA_CFG ||
  window.ENV ||
  window.ILLARA_ENV ||
  null;

console.log("[APP] raw ENV", {
  hasENV: !!CFG,
  keys: CFG ? Object.keys(CFG) : [],
});

if (!CFG || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
  console.error("[APP] ENV check failed:", {
    hasENV: !!CFG,
    url: CFG && CFG.SUPABASE_URL,
    hasKey: !!(CFG && CFG.SUPABASE_ANON_KEY),
  });
  throw new Error(
    "[APP] ENV not loaded or missing SUPABASE_URL / SUPABASE_ANON_KEY"
  );
}

// Make the config available under a consistent name for ui.js
window.ILLARA_CFG = CFG;

console.log("[APP] ENV ready →", {
  supabaseUrl: CFG.SUPABASE_URL,
  hasKey: !!CFG.SUPABASE_ANON_KEY,
});

// 2) Expose loadDashboard globally so we can poke it from the console
window.loadDashboard = loadDashboard;
console.log(
  "[APP] window.loadDashboard set",
  typeof window.loadDashboard
);

// 3) Kick off the dashboard UI
loadDashboard().catch((e) => {
  console.error("[APP] Dashboard load error:", e);
});
