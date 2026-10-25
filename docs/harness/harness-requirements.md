> **Status:** approved by Amit on 2026-10-25 with all recommended defaults. Where this document lists an open question or option, the decision recorded in [decisions.md](decisions.md) applies. Written during discovery, before the phase 1 build.

# Harness requirements

Proposed path: `docs/harness/harness-requirements.md` · Discovery draft, 25 Oct 2026

Each requirement traces to the product intent. **V1** = essential for the first version. **Later** = an enhancement. "Trace" names the source rule. A requirement that rests on an open decision is marked ⚑ and cross-referenced to the target architecture.

## 1. Task orchestration and execution loops

| ID | Requirement | V1/Later | Trace |
| --- | --- | --- | --- |
| O1 | Run a study as six ordered stages (Scope, Collect, Validate, Analyse, Challenge, Publish). Each stage is its own step and writes its own output | V1 | v2 §4; engine plan |
| O2 | A stage ends only when its exit check, **evaluated in code** where it can be mechanised, passes. A model's statement that a check passed is never accepted as the check | V1 | v2 §4; engine plan "Exit gate checked in code"; Vantage Point gap (`index.html:941-955`) |
| O3 | Allow bounded loops back: Validate → Collect when a research question has no tier 1–3 source (until the depth budget or the stopping rule is hit); Challenge → Collect for counter-evidence | V1 (one loop-back per stage, max N set in config) | v2 §4, §8 stopping rule |
| O4 | Pause for the user at Scope (confirmation) and before external publication | V1 | Vantage Point ask card; v2 §2 "ask a concise clarification" |
| O5 | Run several studies at once, with queueing | Later | None in v1 (single user) |
| O6 | Scheduled refresh and re-scoring of published studies | Later; a refresh protocol must first be written | `engine-spec-review.md` gap 10 |

## 2. Agent roles and tool boundaries

| ID | Requirement | V1/Later | Trace |
| --- | --- | --- | --- |
| A1 | One **researcher** role runs stages 01–04 and 06 drafting, with a stage-specific prompt and a tool allowlist per stage | V1 | v2 §1 (team roles collapse into stage prompts) |
| A2 | One **auditor** role runs stage 05 in a fresh context that sees **only** the draft, the source register and the claim register, never the researcher's reasoning or transcript | V1 | v2 §1 "a separate pass that sees only…"; engine plan |
| A3 | Deterministic code, not a model, does scoring arithmetic, label bands, status-tier consistency, the quote-in-snapshot check, calculation recompute and the mechanical gate checks | V1 | v2 §6 formula; engine plan quote check |
| A4 | Tools per stage: Collect gets `search`, `fetch` (snapshot plus hash); Validate gets `read_snapshot` plus a limited `fetch` for origin tracing; Analyse and Publish get no web tools; Challenge (auditor) gets read-only registers plus `search` for counter-evidence ⚑ | V1 | v2 §8 |
| A5 | No tool may log in, bypass paywalls, ignore robots.txt or collect personal data beyond a business role | V1 | v2 §3.13; compliance protocol §2 |
| A6 | No tool can write outside the study workspace. Models cannot edit registers directly; they propose records, and code validates and commits them | V1 | Auditability |
| A7 | Six specialist analyst roles as separate agents | Later, only if evals show stage prompts underperform | v2 §1; brief: "no multi-agent architecture without demonstrated need" |

## 3. Context construction and limits

| ID | Requirement | V1/Later |
| --- | --- | --- |
| C1 | Each stage builds its context from the stored artefacts (inputs, scope, the relevant register slices), not from the previous stage's chat transcript | V1 |
| C2 | The framework library is injected by research question: only the rows of the v2 §5 table and the framework doc entries for the selected tools | V1 |
| C3 | Source text goes to Validate as **quoted snippets with source ID and offsets**, never whole pages, with a per-stage token budget from config | V1 |
| C4 | When the claims exceed the budget, Analyse gets claims grouped by research question, with the weakest-link claim always included | V1 |
| C5 | The auditor context is the draft, the registers and the gate results only (A2) | V1 |
| C6 | Retrieval over past studies ("MCI's own database") | Later; conflicts with the lapse rule ⚑ |

## 4. Persistent task state and checkpoints

| ID | Requirement | V1/Later |
| --- | --- | --- |
| P1 | A per-study workspace holds the state file, every stage's output, the registers, snapshots and the event log | V1 |
| P2 | Checkpoint after every stage and after every tool batch inside Collect, so a crash resumes without repeating fetched pages | V1 |
| P3 | Each record carries the methodology, prompt and model version that produced it | V1 |
| P4 | Retention follows the save-or-lapse rule: lapse deletes the workspace; save keeps it ⚑ (decision 3) | V1 |
| P5 | Studies get versions with a change log on re-run or edit | V1 for the change log field; Later for diffs |

## 5. Retry, timeout, recovery and replay

| ID | Requirement | V1/Later |
| --- | --- | --- |
| R1 | Per-call timeouts and bounded retries with backoff for model, search and fetch calls. Retry only the codes marked retryable (`timeout`, `rate_limited`, `provider_error`, `invalid_json` with one repair attempt) | V1 |
| R2 | **Never fall back to mock or model-only output silently.** If a live step fails, the study shows `stage_failed`, or the claim is marked Not established with the reason | V1 (fixes `aiClient.js:39-51`) |
| R3 | Resume from the last checkpoint after a crash or a user retry. Stages are idempotent given their stored inputs | V1 |
| R4 | Replay: re-run any stage offline from stored snapshots and recorded model responses, to reproduce or debug a result | V1 for snapshots; Later for full model-response replay |
| R5 | Spend guard: a per-study cap on model tokens, searches and pages fetched; on breach, stop with `budget_exceeded` | V1 (engine plan "Spend limit") |

## 6. Source and artefact provenance

| ID | Requirement | V1/Later |
| --- | --- | --- |
| PV1 | Every fetched document is stored as a snapshot with URL, access time, HTTP status, content type and sha256 | V1 |
| PV2 | An attempt at an external archive (Wayback / archive.today) is logged; on failure, `not_archived_reason` is recorded. Whether a local hashed snapshot satisfies QG14 is ⚑ (decision 1) | V1 |
| PV3 | A claim's `supporting_passage` must be found (after normalising whitespace and number formatting) in the cited snapshot, or the claim cannot be above Reported ⚑ (S1) | V1 |
| PV4 | The search log is recorded automatically from tool calls, with all seven golden-case fields | V1 |
| PV5 | Origin tracing: `origin_source_id` links syndicated copies; corroboration counts distinct origins | V1 (manual field set by model, checked by code for presence); Later (automatic duplicate detection) |

## 7. Independent evidence review

| ID | Requirement | V1/Later |
| --- | --- | --- |
| E1 | The auditor (A2) returns, per critical conclusion: alternatives, counter-evidence, assumptions, verification steps and a verdict (keep / downgrade / remove) | V1 |
| E2 | Downgrades are applied by code and logged. The researcher cannot overrule the auditor; a disagreement goes to the human | V1 |
| E3 | A human spot check: the harness samples 10 random material claims for the reviewer and records the error rate | V1 (sampling and form); the reviewer is Amit |

## 8. Quality gates and acceptance criteria

| ID | Requirement | V1/Later |
| --- | --- | --- |
| G1 | Implement the six stage exit checks (v2 §4) as functions returning pass / fail with reasons | V1 |
| G2 | Implement the 14 quality-gate checks. Mechanical in code: 1, 2 (quote found), 4, 5, 9, 11, 14. Judged by the auditor and recorded: 3, 6, 7, 8, 10, 12, 13 | V1 |
| G3 | The critical-check list and the material-claim threshold come from config, not code ⚑ (S5, S6) | V1 |
| G4 | Publication blocked on any critical Fail; Partials listed on page one | V1 |
| G5 | Acceptance for v1: the harness reproduces the golden case's structure and passes the three planted-error tests | V1 |

## 9. Progress tracking and audit logs

| ID | Requirement | V1/Later |
| --- | --- | --- |
| L1 | An append-only event log per study: stage start/end, tool call (inputs, outputs, cost), retries, gate results, user decisions, auditor verdicts | V1 |
| L2 | Progress events feed the existing six-stage stepper and plain-sentence log, and are written by the harness, not invented by the model | V1 (keeps the Vantage Point UI) |
| L3 | The AI-use disclosure is generated from the event log (which steps the AI did, what a human reviewed) | V1 |

## 10. Evaluation datasets and regression tests

| ID | Requirement | V1/Later |
| --- | --- | --- |
| T1 | Unit tests for scoring: the v2 worked examples (63, 78, 42), penalty clamps and label bands | V1 |
| T2 | Fixtures from the two reference registers (44 + 57 claims, 19 + 29 sources): schema validation and arithmetic re-check | V1 |
| T3 | Planted-error suite: missing dataset, conflicting pair, false plausible claim. Pass criteria as v2 §13. Report the pass rate | V1 |
| T4 | A golden-case regression on frozen snapshots: the claims for C02, C06, C07, C08, C10 and the "tie for No.2" conclusion are reproduced, and C09 and C30 are flagged | V1 (offline snapshots) |
| T5 | Two more validation cases: Coca-Cola India and a listed Indian insurer set | Later |
| T6 | Prediction tracking: P1–P4 checked at their due dates (Nov 2026 to Apr 2027) | Later |

## 11. Learning from prior runs

| ID | Requirement | V1/Later |
| --- | --- | --- |
| K1 | Stage prompts and rules live as versioned files ("skills") in the repo. Every run records the versions it used | V1 |
| K2 | Improvements are **proposed** as a diff with the reason (a failed check or reviewer finding), **tested** against T1–T4, and **promoted** only by human approval as a new version | V1 for the process; the improvements themselves come later |
| K3 | Automatic mining of reviewer corrections into proposals | Later |

## 12. Human approval for consequential actions

| Action | Approval required | V1 |
| --- | --- | --- |
| Confirming the scope before Collect | User picks or edits the scope | Yes |
| Publishing or sharing a report outside the workspace | Explicit user action | Yes |
| Exceeding the per-study spend cap | User raises the cap | Yes |
| Using purchased or licensed data, or a source behind terms | User confirms | Yes |
| Promoting a prompt, skill or scoring change | Amit approves after the eval run | Yes |
| Deleting a saved study | User confirms | Yes |
| Contacting people (interviews, surveys) | Out of scope: proposed only, never executed | n/a |
