> **Status:** approved by Amit on 2026-10-25 with all recommended defaults. Where this document lists an open question or option, the decision recorded in [decisions.md](decisions.md) applies. Written during discovery, before the phase 1 build.

# Gap analysis

Proposed path: `docs/harness/gap-analysis.md` · Discovery draft, 25 Oct 2026

Classes: **IV** implemented and verified · **IU** implemented but unverified · **PI** partially implemented · **M** missing · **CR** conflicting or technically risky · **UK** unknown pending inspection.

"Verified" here means checked in this phase by reading the code or recomputing data. Nothing was executed, so no runtime behaviour counts as verified. Priority: **P0** blocks correctness or trust; **P1** reliability or recoverability; **P2** maintainability.

## P0: correctness and trust

| # | Finding | Class | Evidence | Impact |
| --- | --- | --- | --- | --- |
| G01 | No live evidence retrieval anywhere in code. The repo LLM path has no tools; the Vantage Point page states "NO web access" | M | `aiClient.js:13-31`; `index.html:968` | No claim can be Verified; the core promise is unmet in software |
| G02 | Stage "passed" and "Quality gate passed" are cosmetic. Stages auto-pass when their log lines finish; the gate text is model-written or hard-coded | CR | `index.html:941-955, 681, 748` | The UI asserts checks that never ran, which misleads the reviewer |
| G03 | Silent fallback to mock on any LLM error or parse failure, with no flag in the response | CR | `aiClient.js:39-51` | Mock data can be mistaken for analysis; it also contains fabricated names ("CEO: Jane Doe") |
| G04 | Challenge is not independent in either the page (same call as analysis) or the manual runs (same session) | CR | `index.html:1028-1033`; golden case §1 AI-use note | Violates v2 §1 and §4 stage 05 |
| G05 | Verified threshold conflicts: tier 1–2 (v2) vs tier 1 plus quote match (engine plan) | CR | `master-prompt-v2.md` §6A; engine plan "Verified is only given…" | Changes the status of every tier 2 claim |
| G06 | Confidence components differ: five fixed (v2, runs) vs free-form plus a cap of 75 (page) vs three automated (engine plan) | CR | §6B; `index.html:1047-1053`; engine plan stage 06 | Scores are not comparable across runs |
| G07 | "Critical" gate checks and the "material" claim threshold are undefined, yet publication depends on them | M | v2 §12, §3.2-3 | The gate cannot be implemented without a decision |
| G08 | Perspective semantics conflict: is the "subject" me or the rival? | CR | v2 §2 vs `index.html:825`, golden case §1 | Data model and prompts depend on it |
| G09 | Undocumented scoring rule in a reference run (inference ≤ weakest input + 10) | CR | golden-case xlsx "Scoring key" | Either adopt it into v2 or drop it from fixtures |
| G10 | 0 of 48 sources archived; the environment blocks the archive services | PI | both xlsx `Archived URL` empty; golden case §1 | QG14 is Partial on every run until snapshots or an archive path exist |
| G11 | Scoring arithmetic and label bands in the reference registers | IV | Recomputed: 0 mismatches in 44 + 57 claim rows; status-to-tier consistency holds | These can serve as regression fixtures |
| G12 | Scoring worked examples in v2 (63, 78, 42) | IV | Recomputed | Unit-test vectors |
| G13 | No recommendation-confidence method | M | v2 §6D; golden case §14 single numbers | Recommendations cannot be scored reproducibly |
| G14 | Golden case below the Standard source budget (19 vs 25–35), and it does not say so | CR | v2 §8; golden case source register | Either the budget is not a minimum, or the run under-delivered; needs a decision |

## P1: reliability and recoverability

| # | Finding | Class | Evidence | Impact |
| --- | --- | --- | --- | --- |
| G15 | No persistence of study state: the page keeps studies in memory and offers save-to-HTML; the repo writes one overwritten JSON file | PI | `index.html:1086-1126`; `server.js:43-46` | A crash or reload loses the run; nothing to resume or audit |
| G16 | Stages 02–06 run as one model call with no checkpoint | CR | `index.html:1006-1041` | One failure loses all the work; long calls hit limits |
| G17 | No retries, backoff or spend limits in code; a single 20 s timeout in the repo | M | `aiClient.js:30` | Runaway cost or brittle runs |
| G18 | No audit or event log; the progress text is model-authored | M | `index.html:1045` | AI-use disclosure and replay impossible |
| G19 | Errors handled per path: the page maps 6 codes to messages | IU | `index.html:971-978` | Reusable taxonomy for RunError |
| G20 | The page's input normalisation (clamps, label mapping, claim cap) | IU | `index.html:1042-1070` | Useful validators, but silent truncation at 14 claims |
| G21 | Batch sample run with no per-item error isolation | CR | `server.js:38-41` | One failure fails all five |
| G22 | Search provider and access policy marked decided (checklist ticked) but no answer recorded on the comments | UK | Engine plan comments f62e4937, 275d03dd | Needs Amit's recorded choice (Tavily / Brave / Exa) |

## P2: maintainability

| # | Finding | Class | Evidence | Impact |
| --- | --- | --- | --- | --- |
| G23 | `mci-web` install broken: `tailwindcss ^3.5.0` and an undeclared `@vitejs/plugin-react` | CR | `mci-web/package.json:20`; `vite.config.js:2` | The planned front end cannot build |
| G24 | Three incompatible API contracts (`/api/analyze`, `/api/insights`, the page study object) | CR | output-contract §1 | Something must be retired or adapted |
| G25 | No tests, CI, lockfiles, schemas, `.env.example`, `CLAUDE.md` or agent instructions | M | repo tree | No safety net for refactors |
| G26 | Provider mismatch: the code uses OpenAI `gpt-4o-mini`, the README also names Grok (never read), the engine plan uses the Claude API | CR | `aiClient.js:18`; `README.md:30-36`; engine plan | Needs one provider decision |
| G27 | Inputs shown but not read (`f-players`, `f-depth`, uploads); depth options differ from v2's four levels | PI | `index.html:830, 843-844, 697-703` | Users think they configured something they did not |
| G28 | v2 inputs missing from the UI: lifecycle stage, study type, as-of date, horizon, audience, India lens, industry module | M | v2 §2 vs `index.html:821-846` | Framework selection cannot follow v2 §5 |
| G29 | Frameworks fixed per mode rather than chosen by question; no used/excluded tables in the page | PI | `index.html:958-961` | Violates v2 §5 |
| G30 | Register format drift: the Samsung search log has 4 fields vs 7; source registers lack language, limitations and hash | PI | xlsx headers | Fixtures need normalising |
| G31 | Unescaped `s.company` in `innerHTML`; stray `npm cache clean --force` on line 1 | CR | `public/index.html:1, 67, 79` | XSS via `body.companies`; a visible defect |
| G32 | README describes a Windows path and a sample file that is git-ignored | CR | `README.md:9, 16`; `.gitignore:3` | Misleading onboarding |
| G33 | The Vantage Point app lives only in project files and the Artifact, not in the repo | CR | diff of mockup vs published page | Not versioned with the code it depends on |
| G34 | Stale counts across docs: the review says 13 gate checks, v2 has 14; memory says 40 frameworks, the doc says 43 | CR | `engine-spec-review.md`; framework doc | Minor; fix when the docs are next edited |
| G35 | Report exhibits (charts) required by the review but not specified anywhere | UK | `engine-spec-review.md` gap 11 | Needs a decision; leave out of v1 by default |
| G36 | Monitoring/alerts and prediction tracking need persistence, which conflicts with lapse-by-default | CR | framework doc "Signals"; compliance §3.9; `index.html:1114` | Retention decision |

## What already exists and should be reused

- **Methodology:** master prompt v2 (stages, scoring, registers, gate). This is the spec for the harness.
- **UI:** the Vantage Point page's six-stage stepper, ask card, report and claim register views, evidence pills, and the error-code mapping.
- **Data:** the two reference registers as schema and fixtures, the golden-case search log format, and the scoring key sheet.
- **Server:** root `server.js` Express routing and the `data/` directory convention (ignored by git).
