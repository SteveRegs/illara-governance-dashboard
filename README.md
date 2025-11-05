# Illara Governance Dashboard – Phase 2

### Overview
The **Illara Governance Dashboard** provides a unified, visual overview of governance pipeline activity across all Illara systems.  
It summarizes rule compliance, recent runtime events, build status, and phase-based performance at a glance.

This Phase 2 build introduces:
- Core metrics cards (pass rate, trendline, unique rules)
- Real-time phase and principle filters
- Expanded Supabase integration with runtime/build logs
- Automatic local environment isolation (`env.local.js` ignored by git)
- Self-hosted lightweight static server (`http-server`)

---

### 🧭 Local Development

#### 1. Clone
```bash
git clone https://github.com/SteveRegs/illara-governance-dashboard.git
cd illara-governance-dashboard
