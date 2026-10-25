# Approved harness decisions

Approved by Amit on 2026-10-25: "Default for all", plus the added requirements below. This file is the record. Where another document in `docs/harness/` lists options, this file decides.

## Added requirements (Amit, 2026-10-25)

| Requirement | Where it lives |
| --- | --- |
| A clear, clean scoring rubric | `config/scoring-rubric.json`, explained in [scoring-rubric.md](scoring-rubric.md) |
| Search provider swappable with one setting | `SEARCH_PROVIDER` in `.env`, read only in `src/config.js`, resolved in `src/providers/search/index.js` |
| Every output is an interactive HTML file, MetLife blue and white, clean | `src/report/render-html.js`, `src/report/theme.js` |
| Charts use a couple of blue shades, amber and white only | `src/report/charts.js` uses `THEME.navy`, `THEME.blue`, `THEME.light`, `THEME.amber`, `THEME.white` |
| Save, lock, unlock and delete a study | `src/store/study-store.js`; API routes in `src/server/app.js`; `bin/vp.js` |
| Look up past research, re-check material claims, redo only on a material change | `src/library/library.js`, `src/stages/lookup.js` (graph nodes `lookup` and `recheck`) |
| Clean, modular rebuild with a marked rollback point | Branch `rollback/v0-prototype`; old code in `legacy/`; see `ROLLBACK.md` |

## The 27 defaults

| # | Decision | Approved default | Built in phase 1? |
| --- | --- | --- | --- |
| 1a | When is a claim Verified | Tier 1-2 source AND the passage is found in the saved copy; structured official filing values count | Yes, `enforceStatus` |
| 1b | Confidence components | Five v2 components, penalties applied by code | Yes |
| 1c | Critical gate checks | 1, 2, 4, 5, 11, 12 | Yes, `gate.critical` |
| 1d | Material claim | Materiality 3 or more | Yes, `materialThreshold` |
| 1e | Inference ceiling | Never above the weakest material input + 10 | Yes |
| 1f | Local hashed copy and check 14 | Counts as Partial | Yes |
| 1g | Source budget per depth | A target; a shortfall is disclosed on page one | Yes |
| 2a | Server | One Express server at the repo root; legacy code in `legacy/` | Yes |
| 2b | Model | Claude only, tiered: fast model for collect and validate, strong model for scope, analyse, challenge, publish | Yes, `models.stageTier` |
| 2c | Agent framework | Agent SDK inside each stage, our own runner around it | Runner yes; Agent SDK arrives with live tools in phase 2 |
| 2d | Search | Tavily behind an adapter | Yes; Brave and Exa adapters too |
| 2e | Storage | Files first, Supabase at deploy | Files yes; Supabase in phase 5 |
| 2f | Hosting | Local first; Vercel plus Supabase in phase 5 | Local yes |
| 3 | Unsaved studies | Kept 30 days, then purged | Yes, `retention.unsavedDays` |
| 4a | Model calls per stage | One per stage; the auditor may only add counter-evidence searches | Yes |
| 4b | Loop limits | 2 loop-backs per loop, 25 tool calls per stage, 20 stage runs per study | Yes, `loops` |
| 4c | Human approvals | Scope, publishing, spend cap, purchased data, prompt changes | Scope and spend cap pause the run; publishing is the user's save or export; purchased data and prompt changes are not automated at all |
| 5a | Study record | One record; subject is the company studied, "me" is a separate field | Yes |
| 5b | Retire old endpoints | `/api/insights`, `/api/analyze`, the mock path | Yes: they live only in `legacy/` and are not served |
| 5c | Report | Executive first page, claim-linked charts, competitor matrix, PDF export | Yes (PDF via the browser's print) |
| 6a | Safety in v1 | Prompt-injection defence, tool hooks, cost tracking, lock and cancel per study | Injection wrapping, budgets, token and search counts, lock, cancel: yes. Tool hooks arrive with live tools in phase 2 |
| 6b | Demo case | India, Tata vs Mahindra | Synthetic offline fixture in `eval/`; live run in phase 2 |
| 6c | Indian sources | BSE/NSE filings and annual reports | Tier table yes; PDF extraction in phase 3 |
| 6d | Access | Push access requested; keys in `.env`, never in chat | Yes |
| 6e | Reviews | One PR per phase, reviewed by Amit | Yes |

## Phases

1. **This PR.** Harness core, scoring, gate, store, library, providers, report, API, tests. No live calls, no keys needed.
2. Live Claude and Tavily on the Tata vs Mahindra demo; Agent SDK inside stages; tool hooks.
3. PDF and annual-report extraction (BSE/NSE), SEC XBRL structured values, public archiving.
4. Port the Vantage Point stepper UI onto the API.
5. Supabase storage and Vercel deploy.
