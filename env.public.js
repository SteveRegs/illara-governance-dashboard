// env.public.js
(function () {
  const CFG = {
    SUPABASE_URL: "https://hwikvkhsujegdvuszlmc.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3aWt2a2hzdWplZ2R2dXN6bG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzQ3MTYsImV4cCI6MjA4NDYzNDcxNn0.cIxZN5Wjdu_hQuM1n0xz72xHXYvt_gvDVvDQosR4qZw", // real anon key

    SB_PUBLISHABLE_KEY: "sb_publishable_ADwd3qRRdvVaFvzizcOhfg_Ny6jEBmk",
    HARNESS_RUN_URL: "https://hwikvkhsujegdvuszlmc.supabase.co/functions/v1/run-harness",
    HARNESS_HISTORY_LIMIT: 5,

    DEMO_SERVICE_ENABLED: false,
    DEMO_SERVICE_URL: "",
  };

  window.ILLARA_CFG = CFG;
  window.ENV_PUBLIC = CFG; // <-- add this
})();

console.log("[ENV] loaded", {
  hasUrl: !!window.ILLARA_CFG?.SUPABASE_URL,
  keyHead: (window.ILLARA_CFG?.SUPABASE_ANON_KEY || "").slice(0, 6),
  keyLen: (window.ILLARA_CFG?.SUPABASE_ANON_KEY || "").length,
});

