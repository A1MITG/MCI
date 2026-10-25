> **Status:** approved by Amit on 2026-10-25 with all recommended defaults. Where this document lists an open question or option, the decision recorded in [decisions.md](decisions.md) applies. Written during discovery, before the phase 1 build.

# Research and scoring specification (as found)

Proposed path: `docs/harness/research-and-scoring-spec.md` · Discovery draft, 25 Oct 2026

This document records the rules that already exist, word for word where possible. Where a rule is missing, implicit or contradictory, it says so and names the decision needed. **No weights or thresholds were invented.** The authority order observed in the documents is master prompt v2 > framework doc > reference runs > Vantage Point page > repo. That order is itself a decision to confirm (see target architecture, decision 1).

## 1. Source selection and credibility

**Tiers (master prompt v2 §8, India hierarchy):**

| Tier | Sources |
| --- | --- |
| 1 | MCA21 filings, BSE/NSE disclosures and annual reports, SEBI, RBI, IRDAI, TRAI, Gazette notifications, court and tribunal records |
| 2 | Official statistics and ministry data (MoSPI, Commerce, MeitY, Vahan, GSTN); company press releases and official price pages |
| 3 | Industry bodies and research firms with stated methods (ICEA, SIAM, FADA, NASSCOM, IDC, Counterpoint, Omdia/Canalys, CMR) |
| 4 | Reputable journalism (PTI, Reuters, The Hindu, Business Standard, ET, Mint) |
| 5 | Signals: reviews, social media, job posts, app data, forums |

**Rules in force:**

- PIB releases are announcements, not enacted rules, until a Gazette notification exists (§8).
- SEO "market research" pages with unsourced CAGRs are unusable (§8).
- Read laterally about each publisher (§8).
- Collect exit check: each research question has at least one tier 1–3 source, or is marked "Not established" (§4, stage 02).
- Depth budget: Student 10–15 sources; Standard about 25–35; Deep Dive 50+; Board Grade 80+ with licensed data (§8).
- Stopping rule: stop when two consecutive searches yield no new tier 1–3 source, or when the depth budget is reached (§8).

**Gaps:**

- **Missing:** a tier list for jurisdictions outside India. The compliance protocol names SEC EDGAR, Companies House, OECD, World Bank and IMF, but gives them no tiers. Needs an addition to master prompt v2 §8.
- **Missing:** a tier rule for company investor presentations (tier 1 or tier 2 is ambiguous).
- **Conflict:** the stopping rule says "or the depth budget is reached", but the budget reads as a target, not a cap. The golden case is labelled Standard with 19 sources, below the 25–35 budget, and it does not say so. Needs a decision: is the budget a minimum, a target or a cap?

## 2. Evidence provenance and citations

- Citation standard: organisation or author, title, publication date, data period, URL, archived URL, access date, page/table/section, exact supporting passage or figure (compliance protocol §2; master prompt v2 §3.2).
- Publication date and data period are recorded separately (§3.9). Access date is a third field (compliance protocol §2).
- Trace news to the original filing; count syndicated copies as one source (§8).
- Archive every cited page and hash downloaded documents (§8). QG14 is Pass only if every page is archived or the reason is disclosed.
- Verification state per claim: verified against original / verified via intermediary / unverified (§7).

**As practised:** 0 of 48 sources were archived across the two reference runs because the sandbox blocks the archive services. Both runs disclosed this as Partial. The Vantage Point page has no sources at all.

**Proposed** (engine plan): the server saves an archived copy of each fetched page. For a claim to rise above Reported, the quoted passage must be found on the archived page.

## 3. Recency, relevance, novelty, duplication

- Recency is a component worth 0–15, "relative to the claim" (§6B). There is no age-based scale.
- Duplication: the corroboration component (0–20) counts independent sources only, and syndicated copies count once. A −10 penalty applies when all reports trace to a single origin.
- Relevance: materiality 1–5 is tied to the decision affected (§6C).
- **Missing:** a novelty rule (what counts as new versus already known in a refresh). The refresh protocol is listed as a gap in `engine-spec-review.md` gap 10 and is still not defined.
- **Missing:** a numeric recency scale, for example how many points a 2-year-old figure scores for a current-share claim. Today this is analyst judgement. Decide whether it stays a judgement or becomes a rule.

## 4. Competitor identification and comparison

- The universe is built from the customer problem: direct and indirect rivals, substitutes, new and adjacent entrants, private label, informal options, platforms, and do-nothing or self-serve (§9).
- Rank by explicit criteria (customer overlap, substitutability, geographic overlap, scale, growth, pricing pressure, strategic threat), **show the scores**, and list exclusions with reasons. Never claim the list is exhaustive (§9).
- The same 14-dimension profile is built for every player. Each dimension is marked Analysed / Partially analysed / Not applicable / Not established (§10).
- **Missing:** the scale and weights for the seven ranking criteria. "Show the scores" has no defined scoring. Needs a decision in §9, or an explicit statement that ranking is ordinal and judged.
- **Conflict (perspective semantics):** master prompt v2 §2 defines "my competitor" as "I am the subject and need to beat rivals". The Vantage Point page and the golden case make the *rival* the subject and hold "me" separately (`f-subject` = "Competitor to study", `f-me` = "My company"; golden case §1: subject TMPV, "me" Mahindra). The Samsung run follows v2 (Samsung is both subject and "me"). Needs one definition before the data model is fixed.

## 5. Market positioning and competitive analysis

- Frameworks are chosen by research question from a 7-row table (§5). Prefer the tools marked for the subject's lifecycle stage and perspective.
- Every framework used yields a stated conclusion with claim IDs. Every exclusion has a reason (§5).
- Market sizing must state definition, denominator, geography, period, currency, method, status and caveats. TAM is never evidence of achievable revenue (§10).
- Never mix sell-in and sell-out measures (for autos, SIAM wholesale vs Vahan/FADA retail) (§8).
- **As implemented (Vantage Point page):** frameworks are fixed per mode (`LEAD`, `index.html:958-961`), not chosen by question. There is no frameworks-used or frameworks-excluded table.

## 6. Scoring: criteria, weights, thresholds, confidence

**Evidence status, seven values (§6A):** Verified (tier 1–2), Reported (tier 3–4), Calculated, Estimated, Inferred, Hypothesis, Not established.

**Evidence confidence, 0–100 (§6B), preserved exactly:**

```
score = authority(0–25) + directness(0–20) + corroboration(0–20)
      + recency(0–15) + consistency(0–20)
      − 15 if unresolved material contradiction between credible sources
      − 10 if all reports trace to a single origin
      − 10 if weak or undisclosed estimation method
      − 10 if significant missing input
      −  5 if retrieved through an intermediary
score = clamp(score, 0, 100)
label: 85–100 strongly supported · 70–84 well supported
       50–69 partially supported · 0–49 weakly supported
```

"The score is a structured judgement, not a calibrated probability. Never award points for strategic importance."

**Worked examples (§6), usable as regression vectors:** 20+18+8+14+18 = 78, minus 15 = **63**; 15+18+18+15+12 = **78**; 10+6+4+12+10 = **42**. Each was checked and reproduces.

**Materiality 1–5 (§6C):** 1 peripheral, 2 limited, 3 meaningful, 4 high, 5 critical to a major decision. State the decision affected.

**Recommendation confidence (§6D):** a separate 0–100 score "built from the evidence for its consequences (customer demand, margins, competitor response), not from the reliability of its starting facts".

**Weakest link (§6E):** a section's assessment discloses its weakest decision-critical claim. Do not average.

**As practised:** both reference xlsx files apply the five components and penalties. The arithmetic and label bands check out with 0 mismatches. The golden-case "Scoring key" sheet adds a rule that **is not in master prompt v2**: "Inferences and estimates: scored as a whole judgement from the cited claims, never above the weakest material input plus 10." It also merges two −10 penalties into one row.

**As implemented (Vantage Point page, `index.html:968-971, 1047-1053`):** "Verified" is never allowed. Confidence is capped at 75. Confidence is forced to equal the sum of a model-supplied breakdown whose categories are free-form (the sample shows "Source quality 30", which exceeds the v2 authority maximum of 25, `index.html:653`).

**Contradictions to resolve:**

| # | Rule | Source A | Source B |
| --- | --- | --- | --- |
| S1 | When "Verified" applies | v2: tier 1 **or 2** source | Engine plan: only when the quote is found on a **tier 1** page |
| S2 | Confidence components | v2: five fixed components | Vantage Point page: free-form breakdown, cap 75. Engine plan: "server scores confidence from source tier, recency and corroboration" (three) |
| S3 | Ceiling for inferences | Golden case: weakest input + 10 | Not in v2 |
| S4 | Recommendation score breakdown | v2: no components defined | Golden case gives single numbers (55, 58, 50, 62, 80) with a one-line reason |
| S5 | Which gate checks are "critical" | v2 §12 uses the term | Never listed. Both runs claim "passes all critical checks" |
| S6 | "Material claim" threshold | Used throughout v2 | No materiality cut-off defined |

## 7. Contradictory evidence and missing information

- Search for counter-evidence before finalising material conclusions (§3.7). Run a counter-evidence search for every material claim (§8). The golden case logged one counter-evidence query (Q13) for 37 claims, which reads as a looser practice than "every material claim".
- Validate exit check: contradictions are logged with a resolution or disclosed as unresolved (§4).
- An unresolved contradiction carries −15 (§6B).
- Missing evidence is written as "Not established from available evidence." (§3.5). An inaccessible source is said to be inaccessible (§3.6).
- Planted-error pass criteria (§13): (a) a missing dataset gives "Not established"; (b) a conflict is logged and disclosed; (c) a false claim is rejected or flagged.
- **Missing:** a resolution procedure for picking between two credible conflicting figures (for example, the higher tier wins, or the more recent wins, or both are shown). The runs show both and leave the conflict unresolved (golden case C30).

## 8. Generation of recommendations

- Each recommendation has an owner, timing, trigger, risk of inaction and its own confidence score (§11 item 16). QG11: recommendations trace to findings and are scored separately.
- Competitor mode ends in actions; market mode ends in judgements (framework doc).
- Value at stake comes with formulas and sensitivities (§10).
- The golden case table adds "starting-fact confidence" and "materiality" columns, and no "owner" column. That is a format drift from §11.
- **Missing:** how recommendation confidence is computed (see S4), and whether a low-scoring recommendation is suppressed or only labelled.
