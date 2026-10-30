# Scoring rubric (v2.1)

The machine-readable rubric is `config/scoring-rubric.json`. Code reads it; nothing else hard-codes a weight. Change the JSON, bump its `version`, and the registers tests tell you whether past studies still reproduce.

**Who does what.** The model proposes a status, the five component points and up to three penalties for each claim. Code then:

- assigns the source tier from `config/source-tiers.json` (the model's view of a source never counts);
- checks the quoted passage against the saved copy of the page;
- enforces the status rules;
- recomputes every calculation;
- adds the automatic penalties;
- totals, clamps and labels the score;
- applies the inference ceiling.

## 1. Evidence status

| Status | Rule enforced by code |
| --- | --- |
| Verified | Best source is tier 1-2 **and** the supporting passage is found in the saved copy, or the value comes from a structured official filing. Otherwise it drops to Reported, or to Hypothesis for a tier 5 source |
| Reported | Tier 3-4 source, or tier 1-2 whose passage was not matched. A Reported claim whose passage is not found becomes Hypothesis |
| Calculated | Code evaluates the formula from the input claims. If the formula cannot be computed, the claim becomes Hypothesis |
| Estimated | Approximate value with a disclosed method |
| Inferred | Interpretation of cited claims (`depends_on`) |
| Hypothesis | Needs testing |
| Not established | No usable evidence. Confidence is null. The research question is marked on page one |

## 2. Confidence score (0-100)

Total = authority + directness + corroboration + recency + consistency + penalties, clamped to 0-100.

| Component | Max | Anchors (points: meaning) |
| --- | --- | --- |
| Authority | 25 | 25: regulator, exchange or statutory filing · 21: official statistics or the company's own release · 18: industry body with a stated method · 15: industry body, method not stated · 12: reputable journalism · 6: signals |
| Directness | 20 | 20: states the exact figure, same unit and period · 17: states it with a unit, period or wording mapping · 13: one clear step of inference · 8: implied · 3: tangential |
| Corroboration | 20 | 19: three or more independent origins including tier 1-2 · 16: three or more · 12: two · 8: one origin, several outlets · 4: one origin, one outlet · 0: none |
| Recency | 15 | 15: latest period · 12: one period behind · 9: two behind · 5: older but structural · 2: stale |
| Consistency | 20 | 19: clean · 15: minor mapping, disclosed · 11: definitional caveat, disclosed · 6: known mismatch (wholesale vs retail, EBITDA vs PBIT) · 2: source contradicts itself |

**Authority bands by tier.** These are checked, and a breach warns:

| Tier | Points |
| --- | --- |
| 1 | 23-25 |
| 2 | 20-22 |
| 3 | 15-18 |
| 4 | 10-14 |
| 5 | 0-8 |

### Penalties

| Penalty | Points | Applied by |
| --- | --- | --- |
| Unresolved contradiction | −15 | Code: two claims with the same entity, measure, period and unit differ by more than 2% |
| Single origin | −10 | Code: more than one cited source, all tracing to one origin |
| Weak estimation method | −10 | Model, from the fixed list |
| Missing input | −10 | Model, from the fixed list |
| Intermediary | −5 | Code: `verification_state` is intermediary |

### Labels and ceiling

| Score | Label |
| --- | --- |
| 85 or more | Strongly supported |
| 70-84 | Well supported |
| 50-69 | Partially supported |
| Under 50 | Weakly supported |

An Inferred, Estimated or Hypothesis claim never scores above its weakest material input claim + 10.

**Worked examples.** These are tested:

| Example | Components | Penalties | Total |
| --- | --- | --- | --- |
| Revenue from an RoC filing via two newspapers | 20+18+8+14+18 | single origin −10, intermediary −5 | 63 |
| Two trackers agree on rank, differ on % | 15+18+18+15+12 | none | 78 |
| Intention inferred from a press interview | 10+6+4+12+10 | none | 42 |

## 3. Materiality (1-5)

1 peripheral, 2 limited, 3 meaningful, 4 high, 5 critical to a major decision. A claim at **3 or more is material**. Material claims get the strict gate checks and are the ones re-checked when a later study reuses this one.

## 4. Recommendation confidence (0-100)

A recommendation is scored on the evidence for its consequences, separately from its starting facts. The weakest starting fact's confidence is shown beside it and never added.

| Component | Max | Question |
| --- | --- | --- |
| Demand | 25 | Is there evidence customers want the outcome? |
| Economics | 25 | Is there evidence the margins and costs work? |
| Competitor response | 20 | Is the likely response evidenced, and survivable? |
| Feasibility | 15 | Can the owner execute it with known resources and timing? |
| Reversibility | 15 | Can it be stopped or reversed cheaply if wrong? |

Each untested critical assumption costs −10, with at most two applied.

## 5. Calibration against the hand-built registers

`test/fixtures/registers.json` holds the golden case (44 claims) and the Samsung study (57 claims). Every scored row reproduces its total and label (`test/scoring.test.js`).

- The authority bands were set from the observed values:
  - Tier 1 and 2 Verified rows scored 25.
  - Tier 3 rows mostly scored 15-18.
  - Tier 5 rows scored 6-8.
  - Tier 4 rows ranged from 12 to 20, so some past rows fall outside the 10-14 band. These rows produce warnings, not errors.
- The Samsung register used four penalties outside the v2 list: "assumes Samsung ASP = market ASP", "page contradicts itself", "comparability gap" and "company claim". v2.1 no longer allows ad hoc penalties. Those cases belong in the consistency or directness component instead.
