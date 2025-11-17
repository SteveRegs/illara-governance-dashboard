// app.js — plain script (no imports)

// 1) Read ENV injected by env.public.js
const CFG = window.ENV || window.ILLARA_ENV;

if (!CFG || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
  console.error("ENV check failed:", {
    hasENV: !!CFG,
    keys: CFG && Object.keys(CFG),
  });
  throw new Error(
    "ENV not loaded or missing keys: include env.public.js before app.js"
  );
}

// 2) Expose config globally for UI + console helpers
window.ILLARA_CFG = CFG;

console.log("[APP] ENV ready", {
  supabaseUrl: CFG.SUPABASE_URL,
  hasKey: !!CFG.SUPABASE_ANON_KEY,
});

// 3) Kick off UI if available
if (typeof window.loadDashboard === "function") {
  const result = window.loadDashboard();
  if (result && typeof result.catch === "function") {
    result.catch((e) => {
      console.error("Dashboard load error:", e);
    });
  }
} else {
  console.error("[APP] window.loadDashboard is not defined");
}
