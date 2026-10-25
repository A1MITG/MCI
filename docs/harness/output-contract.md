> **Status:** approved by Amit on 2026-10-25 with all recommended defaults. Where this document lists an open question or option, the decision recorded in [decisions.md](decisions.md) applies. Written during discovery, before the phase 1 build.

# Output contract

Proposed path: `docs/harness/output-contract.md` · Discovery draft, 25 Oct 2026

Four output shapes exist today and none of them is compatible with another. This document records each one, then proposes a single canonical study record (marked **[Proposed]**) that the existing shapes can be derived from.

## 1. Existing contracts that must stay compatible, or be retired deliberately

### 1a. Repo prototype: `POST /api/analyze` (`server.js:14-24`, `aiClient.js:13, 67-99`)

```jsonc
// success 200
{ "ok": true, "data": {
  "company": "string", "region": "string",
  "executiveSummary": "string",
  "competitorDiscovery": { "topCompetitors": ["string"], "notes": "string" },
  "marketSizing": { "TAM": "string", "SAM": "string", "SOM": "string", "growthRate": "string" },
  "companyXRay": { "businessModel": "string", "revenueEstimate": "string",
                   "leadership": ["string"], "techStack": ["string"] },
  "alerts": [{ "type": "string", "text": "string" }],
  "scenarioSimulations": [{ "scenario": "string", "impact": "string" }],
  "generatedAt": "ISO-8601",
  "_openai_raw": "string?"            // only when parsing failed
}}
// 400 { "error": "company is required" }   500 { "error": "message" }   (no "ok")
```

`POST /api/run-sample` returns `{ok, path, samples:[{company, timestamp, analysis}]}`. `GET /api/samples` returns `{ok, data:{generatedAt, samples}}` or 404 `{error}`. The README says: "Keep the same output shape to avoid breaking the frontend." The only consumer is `public/index.html`.

### 1b. Web scaffold: `GET /api/insights?q=` (`mci-web/server/server.js:13-26`)

```json
{ "query": "string", "summary": "string",
  "top_competitors": [{ "name": "string", "relevance": 0.92 }],
  "tam": { "value": "1.2B", "currency": "USD", "confidence": "medium" } }
```

Its only consumer is `Hero.jsx`, which dumps it as JSON.

### 1c. Vantage Point page: in-page study object (`index.html:704-751, 1042-1070`)

```jsonc
{
  "kind": "sample|new", "mode": "competitor|market", "title": "string",
  "subject": "string", "inputs": { "subject","me","region","period","decision","ceiling" },
  "meta": "string", "subjectLine": "string", "saved": false,
  "state": { "s": ["pending|running|passed|attention" ×6], "lines": [int ×6], "open": 0, "ask": false },
  "logs": [[string] ×6],
  "ask": { "q": "string", "opts": [2], "lines": [2] } | { "kind": "name", "q", "ph" },
  "error": { "stage": 0, "msg": "string" } | null,
  "claims": [{
    "id": "C-01", "dim": "string", "text": "string",
    "ev": "Verified|Reported|Calculated|Estimated|Inferred|Hypothesis|Not established",
    "conf": "0–75 | null", "mat": "1–5",
    "src": ["S-02"], "ver": "string", "period": "string",
    "passage": "string", "calc": "string",
    "brk": [["label", int]],          // free-form components and penalties
    "contra": "string", "decision": "string", "next": "string", "live": true
  }],
  "report": { "answer": "string", "limitations": ["string"], "findings": ["claim id"],
              "list": ["Title. Sentence."],            // moves | outlook
              "table": [["string","string"]] }         // battlecard | players
}
```

The UI assumptions that must hold: exactly six stages in this order; four stage states; seven evidence labels in this order (`EV`, `index.html:644`); confidence `null` for Not established; materiality as five dots; one scoping question with two options; a claim ID used as the link key.

The model's reply contract (the `liveMain` prompt, `index.html:1031-1033`) uses field names that differ from the stored object: `dimension, label, confidence, materiality, basis, contradicting, decisionAffected, nextStep, breakdown`.

### 1d. Reference runs: register spreadsheets (golden case and Samsung `.xlsx`)

| Sheet | Columns (as found) |
| --- | --- |
| Claims | Claim ID · Dimension / section · Claim wording · Status · Source IDs · Supporting passage or figure · Calculation · Data period · Authority (0-25) · Directness (0-20) · Corroboration (0-20) · Recency (0-15) · Consistency (0-20) · Penalty total · Penalty reasons · Confidence (0-100) · Label · Materiality (1-5) · Decision affected · Contradictory evidence · Verification state · Next verification step |
| Sources | Source ID · Publisher · Author · Title · Tier (1-5) · Publication date · Data period · URL · Origin · Notes · Access date · Archived URL |
| Search log | Golden case: Query ID · Query text · Engine or site · Date · Results reviewed · Sources kept · Purpose. Samsung: # · Query · Date · Engine (**drift**) |
| Scoring key | Item · Rule (golden case adds the inference ceiling rule) |

Claim ID prefixes in use: `C` (claims), `I` (inferences), `V` (value at stake), `R` (recommendations), `P` (predictions), `S` (sources), `Q` (queries). Master prompt v2 does not define these prefixes. They are a convention from the runs.

Fields master prompt v2 §7 requires that the runs lack: source **language**, **access limitations** (the runs use "Notes" instead), and **file hash**.

## 2. Canonical study record [Proposed]

This is the one contract the harness writes. Contracts 1a–1d become views of it. Field names follow master prompt v2 §7 and the xlsx headers. Types are JSON Schema-style.

```yaml
Study:
  study_id: string            # ULID
  version: int                # change log increments this
  methodology_version: string # e.g. "master-prompt-v2"; prompt/skill versions per stage
  created_at, updated_at: datetime
  state: StudyState           # see target-architecture.md
  inputs:                     # master prompt v2 §2
    question: string
    perspective: competitor | market
    study_type: string?       # six v2 types; optional in v1
    subject: { name, entity_type?, legal_entity?, parent? }
    me: { name }?             # competitor mode; semantics pending decision 5
    competitors_hint: [string]?
    geography: string?; period: string?; as_of: date; forecast_horizon: string?
    decision: string?; audience: string?
    depth: Student | Standard | Deep Dive | Board Grade
    evidence_allowed: public | public_and_purchased
    lifecycle_stage: enum?; india_lens: yes | no | n/a; industry_module: string?
    assumptions: [string]     # working assumptions for missing non-essential inputs
  scope:                      # stage 01 output
    decision, market_definition, denominator, unit_of_analysis
    evidence_ceiling: string  # e.g. "Board Grade requested; Standard achievable"
    research_questions: [{ id: "RQ1", text, frameworks: [string] }]
    competitor_criteria: [string]
    confirmed_by_user: { option, at }?
  search_log: [{ query_id, query_text, engine, date, results_reviewed, sources_kept: [S..], purpose: evidence|counter_evidence, rq_ids }]
  sources:  [{ source_id, publisher, author?, title, tier: 1..5, published: date?, data_period?, accessed: datetime,
               url, archived_url?, not_archived_reason?, snapshot_path?, sha256?, origin_source_id?, language?,
               access_limitations? }]
  claims:   [{ claim_id, kind: claim|inference|estimate|value_at_stake, dimension: 1..14|section, wording,
               status: Verified|Reported|Calculated|Estimated|Inferred|Hypothesis|Not established,
               source_ids: [S..], supporting_passage?, passage_found_in_snapshot: bool?,
               calculation?: { formula, inputs: {name: claim_id|value}, result, rounding },
               data_period?, confidence?: { authority, directness, corroboration, recency, consistency,
               penalties: [{ reason, points }], total, label }, materiality: 1..5, decision_affected?,
               contradictory_evidence?: [claim_id|string], verification_state: original|intermediary|unverified,
               next_verification_step?, depends_on?: [claim_id] }]
  frameworks_used:     [{ name, rq_id, conclusion, claim_ids }]
  frameworks_excluded: [{ name, reason }]
  dimensions: [{ n: 1..14, status: Analysed|Partially analysed|Not applicable|Not established, note }]
  challenge: [{ conclusion_ref, alternatives, counter_evidence, assumptions, verification_steps, auditor_verdict }]
  recommendations: [{ rec_id, action, owner?, timing?, trigger, risk_of_inaction, starting_fact_ids,
                      starting_fact_confidence, confidence: { total, basis }, materiality }]
  predictions: [{ pred_id, statement, check_by: date, falsifier }]
  quality_gate: [{ check: 1..14, result: Pass|Partial|Fail, critical: bool, note }]
  report: { answer, central_conclusion, findings: [claim_id x3+], major_uncertainty, limitations: [string],
            sections: [{ n, title, body_md, claim_ids }], closing: { establishes, suggests, unknown,
            best_next_evidence, decide_now, wait } }
  ai_use_disclosure: string
  change_log: [{ version, at, by, summary }]
  errors: [RunError]
```

## 3. Error and incomplete-research states [Proposed, building on what exists]

| State | Meaning | Existing precedent |
| --- | --- | --- |
| `needs_input` | Stage 01 needs the user (subject missing, scope choice) | Vantage Point `ask` card, stage "attention" |
| `stage_failed` | The stage errored after retries; `errors[]` holds the code and message | Vantage Point `error {stage, msg}` and `liveError` codes |
| `gate_blocked` | A critical exit check or quality-gate check failed; the publish is held | v2 §12 "A Fail on a critical check blocks publication" |
| `published_with_gaps` | All critical checks passed, some Partial; the gaps are on page one | Both reference runs |
| `not_established` (claim level) | Claim kept with status Not established, `confidence: null` | v2 §3.5; Vantage Point `conf: null` |
| `lapsed` / `cancelled` | Discarded by the user | Vantage Point "Let it lapse" |
| `mock` flag | Output not researched (dry run or mock) | **Missing today.** The repo mock and the page dry run are not machine-flagged; the page shows a text banner only. Must be a required boolean |

`RunError: { stage, code: timeout|rate_limited|invalid_json|refused|fetch_blocked|budget_exceeded|provider_error, message, attempt, at, retryable }`

## 4. Report sections and visualisations

- The report follows master prompt v2 §11's 18 sections. The reference runs reorder and rename them (golden case: 22 sections, plus "Comparison with the test input"). **Decision:** is §11 an ordering the report must follow exactly, or a coverage checklist?
- The Vantage Point report view must keep: answer → limitations → key findings → moves/outlook → table → claim register link.
- **No visualisation contract exists.** Neither reference run has charts. The UI prompt bans charts on the home screen but does not specify report exhibits. Leave this out of v1 unless Amit decides otherwise.
