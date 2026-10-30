Stage 03 Validate. Turn the saved sources into claim records.

For each material fact in the sources that bears on a research question, write one claim:
- id: number claims C01, C02..., inferences I01..., estimates E01..., value-at-stake items V01..., and use these IDs in calculation.inputs and depends_on. Code keeps an ID when it is well formed and unique.
- wording: one specific, checkable statement.
- source_ids and supporting_passage: copy ONE continuous passage EXACTLY as it appears in the cited source (it will be string-matched). Never join separate sentences, never use "..." to skip text, and never reword, fix or shorten it. If the fact needs two places in a page, make two claims or quote the shortest single passage that contains it.
- status: Verified and Reported are only for kind "claim". An estimate (a forecast, market size or projection, even one a research firm publishes) is Estimated; an inference is Inferred. Code relabels any other choice.
- status: Verified (tier 1-2 source states it), Reported (tier 3-4), Calculated (derived from other claims; give calculation.formula using input names and calculation.inputs mapping names to claim IDs; code computes the result), Estimated, Inferred (give depends_on claim IDs and reasoning), Hypothesis, or Not established.
- metric (when the claim is a number): entity, measure, period, value (number), unit. Use the same entity/measure/period spelling across claims so conflicts can be detected.
- components: score authority (0-25), directness (0-20), corroboration (0-20), recency (0-15), consistency (0-20) using this rubric:
{{RUBRIC}}
- penalties: only from weak_estimation_method, missing_input, unresolved_contradiction (single-origin and intermediary penalties are applied by code).
- verification_state: original (read in the original document), intermediary (read in a report of it) or unverified.
- materiality 1-5, decision_affected, contradictory_evidence, data_period, next_verification_step.
For each research question with no usable evidence, add a claim with status "Not established" naming what is missing.
Keep reporting dates and data periods separate. Do not mix measures (e.g. wholesale vs retail, EBITDA vs PBIT) without saying so.
