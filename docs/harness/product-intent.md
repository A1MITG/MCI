> **Status:** approved by Amit on 2026-10-25 with all recommended defaults. Where this document lists an open question or option, the decision recorded in [decisions.md](decisions.md) applies. Written during discovery, before the phase 1 build.

# Product intent brief

Proposed path: `docs/harness/product-intent.md` · Discovery draft for review, 25 Oct 2026 · Not committed to the repo

## How to read this

Every statement carries one of four tags:

- **[Implemented]**: present in code that exists today (file and line given).
- **[Intended]**: written down as the product's methodology or design, but not built in code.
- **[Proposed]**: suggested in a plan or review and not yet agreed.
- **[Unknown]**: no evidence; the file or decision that would settle it is named.

The evidence comes from three places, which do not agree with each other:

| Short name | What it is | Location |
| --- | --- | --- |
| Repo prototype | Express server + static page, mock AI client | `A1MITG/MCI` root: `server.js`, `aiClient.js`, `public/index.html` |
| Repo web scaffold | Vite/React marketing site + Express stub | `A1MITG/MCI/mci-web/` |
| Vantage Point page | The clickable app published as an Artifact. It runs studies on Claude inside the page. Byte-identical to the mockup file apart from the viewer wrapper (diffed on 25 Oct). | `/mnt/project-files/mci/vantage-point/mockup/index.html`; https://claude.ai/artifact/RnYiFgjSoaE1aTMsu8V3aj |
| Master prompt v2 | The research procedure: stages, evidence policy, scoring, registers, quality gate | `/mnt/project-files/mci/master-prompt-v2.md` |
| Framework doc | The library of what to analyse: 7 questions, 14 dimensions, 43 frameworks, two perspectives | `/mnt/project-files/mci/competitive-intelligence-framework.md` |
| Reference runs | Two studies run by hand under master prompt v2, with claim registers | `golden-case-tata-pv-vs-mahindra.*`, `samsung-india-mobile-ci-study.*` and their `.xlsx` |
| Live-source engine plan | Plan for a server-side engine with search and fetching | Claude Doc https://claude.ai/artifact/Q99GHzn1BBWunKr4uVZzrE |

The repo has no `CLAUDE.md`, agent instructions, skills, schemas, tests, CI or lockfiles. It has one commit (`99b9afd "all"`) and a clean working tree.

## 1. The problem the application solves

- **[Intended]** Produce a defensible, auditable competitive intelligence study for any company, product or market: "the most accurate, transparent and analytically useful report the available evidence can support, not the most persuasive one" (master prompt v2 §1). The defining principle is that every conclusion is traceable to evidence, every calculation is reproducible, every inference discloses its assumptions, and every unknown stays unknown (§3.14; framework doc, "How to use").
- **[Intended]** Do it fast and cheaply, at roughly "80% of a consulting study in minutes" (`mci-vs-commissioned-studies.md`, "The short answer"). The last 20% (interviews, bespoke models, the signed-off recommendation) is out of reach.
- **[Implemented, mock only]** The repo prototype promises "instant market & competitor insights" for a company name and region (`mci-web/src/components/Hero.jsx:28-29`; `public/index.html:20`). It returns mock or unsourced LLM output (`aiClient.js:7,67-99`).

The repo's framing ("instant insights") conflicts with the methodology's ("evidence-first, auditable"). The later documents take the evidence-first position, so this brief treats it as the product intent and the repo as an early prototype.

## 2. Intended users and their decisions

| User | Decision they make | Source | Tag |
| --- | --- | --- | --- |
| Founders, strategy, product, marketing and sales teams (competitor mode) | How to beat a named rival and how the rival will react: battlecards, pricing response, roadmap gaps, launch counter-plans | Framework doc, perspective table | Intended |
| Investors, consultants, new entrants, analysts, journalists, vendor buyers (market mode) | Who leads a space, why, and where it is heading: landscape, rankings, sizing, outlook | Same | Intended |
| Strategy teams, product and marketing, CI units, consultants, CXOs | Not stated | `mci-web/src/pages/Home.jsx:12-19` | Implemented (marketing copy only) |
| A supervisor or reviewer who audits a study | Whether the study can be trusted: spot-checks 10 random claims | `compliance-and-research-protocol.md` §3 | Intended |
| Students (depth "Student") | Academic market research | Master prompt v2 §2 | Intended |

- **[Intended]** First target: companies of 50+ people at lifecycle stages 4 to 6 (go-to-market, launch, grow), in both perspectives (framework doc, "Open questions, answered").
- **[Intended]** The app starts private to Amit; sharing is decided after ten test studies (engine plan, "Risks"; the checklist item is ticked).
- **[Unknown]** Whether paying external users are in scope for v1. Needs a product decision.

## 3. User inputs and configurable parameters

| Input | Master prompt v2 §2 | Vantage Point page | Repo prototype |
| --- | --- | --- | --- |
| Question / free text | Research question or decision | Required: the main box | Company name only (`public/index.html:25`) |
| Perspective | "My competitor" or "the market", plus one of six study types | Two-way switch only (`index.html:821-832`) | None |
| Subject | Company, product or service, entity type, legal entity, parent | `f-subject` ("Competitor to study" / "Market or space") | `company` |
| My company | Implied by "my competitor" | `f-me`, competitor mode only | None |
| Region / geography | Yes | `f-region`, free text | `region`: global, europe, north-america, apac (`public/index.html:26-31`) |
| Period, as-of date, forecast horizon | All three | `f-period` only | None |
| Decision to inform | Yes | `f-decision` | None |
| Evidence ceiling | Stated at start, derived from depth and data | "Public sources only" / "Public and purchased data" (`index.html:842`) | None |
| Depth | Student, Standard, Deep Dive, Board Grade | Market mode shows "Landscape overview / Full market study" (`index.html:844`), but `readInputs` never reads it (`index.html:697-703`) | None |
| Players to include | Primary, adjacent, substitutes, customers | Market mode `f-players` is shown but never read | None |
| Own data uploads | "Available data, files or database access" | Drop zone is decorative, with no handler (`index.html:843`) | None |
| Lifecycle stage, audience, India lens, industry module | Yes | Missing | Missing |

**[Implemented, Vantage Point]** A bare name is treated as the subject. A question (one ending in "?", starting with a wh-word, or longer than six words) needs the subject named at Scope, and the page asks for it (`index.html:697-701, 744`).

## 4. Research questions the application answers

- **[Intended]** Seven core questions: Who are they? Where are they going? What do they offer? Who buys, and why? How do they win? What can they sustain? What will they do next? (framework doc). These map onto 14 intelligence dimensions.
- **[Intended]** Seven decision questions drive framework choice (master prompt v2 §5): Is the market attractive? Why does one competitor win? Where does the money go? Where should the company grow? What will the competitor do next? Which customers are vulnerable to switching? What is the best strategic response?
- **[Implemented, Vantage Point]** The page hard-codes five lead dimensions and named frameworks for each perspective (`index.html:958-961`, `LEAD`). It does not select frameworks by question.
- **[Implemented, repo]** Fixed sections: executive summary, competitor list, TAM/SAM/SOM, company X-ray, alerts, scenarios (`aiClient.js:13`).

## 5. Expected reports, scores, visualisations and recommendations

- **[Intended]** An 18-section report (master prompt v2 §11). Scope and limitations are on page one, and the report ends with the frameworks used and excluded, the quality gate, the source register, the claim register, the methodology and AI-use disclosure, and a change log. The two reference runs follow this structure with 21–22 sections.
- **[Intended]** For each claim: one of seven evidence statuses, evidence confidence 0–100 with a component breakdown, and materiality 1–5. Recommendations get their own confidence score. A section's assessment shows its weakest link (§6).
- **[Intended]** Mode-specific endings. Competitor mode gives actions (battlecard, pricing response, roadmap gaps); market mode gives judgements (landscape map, rankings, outlook) (framework doc; UI prompt v2 §3D).
- **[Intended]** Predictions to track, each with a check-by date and a falsifier (`compliance-and-research-protocol.md` §3.9; golden case §15).
- **[Proposed]** A minimum set of exhibits per section, such as share over time, profit pools and positioning maps (`engine-spec-review.md` gap 11). Neither reference run has charts, and no rule fixes which exhibits are required.
- **[Implemented, Vantage Point]** Report view: answer, limitations, key findings with an evidence pill, confidence meter and materiality dots, then recommended moves and battlecard (or outlook and key players), plus a claim register with filters and a claim side panel (`index.html:1133-1210`). Export to PDF and Word appears in a menu. Only "Save as HTML" is wired (`index.html:1086-1112`).

## 6. Definition of a useful and trustworthy result

- **[Intended]** It passes the 14-check quality gate (master prompt v2 §12). A Fail on a critical check blocks publication, and Partials are disclosed.
- **[Intended]** "A report is not 'fully verified' because its references exist. The evidence must support the claims actually made." (§7)
- **[Intended]** It shows that it reports uncertainty rather than filling gaps. In the planted-error tests the engine must write "Not established" for missing data, disclose a conflict between two credible sources, and flag a false claim (§13).
- **[Intended]** It is decision-useful. The report closes with what the evidence establishes, what it suggests, what remains unknown, what evidence would most improve it, and which decisions can be made now (§12).
- **[Intended]** It is checkable by a supervisor: a spot check of 10 claims, with the error rate reported (`compliance-and-research-protocol.md` §3).
- **[Unknown]** Which of the 14 checks are "critical". Master prompt v2 uses the word but never lists them. Needs a decision recorded in `master-prompt-v2.md` §12.
- **[Unknown]** The threshold for a "material" claim, which rules 2–3 and the gate depend on. Materiality runs from 1 to 5, but no cut-off is defined. Needs the same decision.

## 7. Product boundaries and non-goals

- **[Intended]** No fabricated facts, quotes, sources, statistics, interviews or survey results. Primary research is shown as proposed, never simulated (master prompt v2 §3.1, §3.12).
- **[Intended]** No scraping behind logins, no pretexting, respect for robots.txt and site terms. For individuals, collect only their business role (§3.13; compliance protocol §2).
- **[Intended]** Do not infer performance from ads, hiring, traffic or announcements alone, and do not infer causation from correlation (§3.10–11).
- **[Intended]** Depth may not exceed the evidence ceiling (§2).
- **[Intended]** Not a dashboard-of-everything: no KPI tiles or charts on the home screen (UI prompt v2 §2, §5).
- **[Implemented, Vantage Point]** Nothing is kept by default. A study is saved as an HTML file or lapses (`index.html:1086-1126`). The engine plan carries this rule into the server: the per-study workspace is deleted when the study lapses.
- **[Intended]** Not a replacement for proprietary datasets or expert interviews (`mci-vs-commissioned-studies.md`).
- **[Unknown]** Whether ongoing monitoring and alerts (framework doc, "Signals"; repo `alerts`) are in v1. They conflict with "nothing kept by default". See the gap analysis.
