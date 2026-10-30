> **Status:** approved by Amit on 2026-10-25 with all recommended defaults. Where this document lists an open question or option, the decision recorded in [decisions.md](decisions.md) applies. Written during discovery, before the phase 1 build.

# Existing workflow map

Proposed path: `docs/harness/current-workflow.md` · Discovery draft, 25 Oct 2026

Three separate workflows exist today. None of them implements the intended pipeline end to end.

- **Path A, the repo prototype** (`server.js` + `aiClient.js` + `public/index.html`). This is the only research path in the repo, and it is mock by default.
- **Path B, the repo web scaffold** (`mci-web/`). A marketing site whose search box hits a fixed mock. It does no research.
- **Path C, the Vantage Point page** (the Artifact). Two Claude calls run inside the page, with no web access. This is the most complete executable workflow, but it lives outside the repo.

The only outputs that meet the methodology, the golden case and the Samsung study, were made **by hand** by Claude in project threads following master prompt v2. No code produced them. That manual process (Path D) is the de facto reference workflow the harness has to reproduce.

None of these paths was executed in this phase (read-only, no installs). The repo app statuses below come from reading the code. A prior session's note (24 Oct) records that both repo apps start once the `mci-web` install workaround is applied.

## Path A: repo prototype, traced

```
public/index.html  #analyzeBtn  (company, region)
  → POST /api/analyze {company, region}                 server.js:14-24
      400 if !company
  → aiClient.generateAnalysis({company, region})        aiClient.js:9
      MOCK = MOCK==='true' || !OPENAI_API_KEY           aiClient.js:7
      ├─ mock → mockedAnalysis()                        aiClient.js:67-99
      └─ live → POST api.openai.com chat/completions    aiClient.js:17-31
                model gpt-4o-mini, temp 0.2, max_tokens 800, timeout 20 s
                system prompt asks for fixed JSON keys   aiClient.js:13
                user prompt "best-effort public facts… mark estimates"  :15
           → tryParseJson (whole text, then first {...})  :54-65
           ├─ parse fail → mock + _openai_raw            :39-43
           └─ any error  → mock (console.error only)     :48-51
  → {ok:true, data}  → renderAnalysis()                  public/index.html:85-92
```

The batch variant `POST /api/run-sample` (`server.js:27-53`) loops over five default insurers (or `req.body.companies`) one after another. It writes `data/insurance_samples.json`, which `GET /api/samples` reads back (`server.js:56-66`). `data/*.json` is git-ignored (`.gitignore:3`), so the sample the README mentions is not in the repo.

## Path C: Vantage Point page, traced

```
Home: mode switch (competitor | market), question, optional fields     index.html:821-846
  → readInputs(q, mode) → {subject, me, region, period, decision, ceiling}  :697-703
  → newStudy(): placeholder claims (all "Not established"), canned log lines  :704-751
  → begin(): window.claude.use("sample")                                 :957, 980-987
      ├─ no Claude available → startRun(): scripted dry run, no research  :936-940
      └─ liveScope(): sample.json(prompt, effort low)                    :988-1005
            prompt = RULES + "run stage 01 Scope" + studyBrief
            reply  = {lines[3], question, options[2], optionLines[2]}
         → stage 01 shows "attention" with one inline question card
  → user picks an option → liveMain(): ONE call for stages 02–06         :1006-1041
            sample.json(prompt, effort medium)
            reply = {stages{collect,validate,analyse,challenge,publish}: log lines,
                     answer, limitations[], claims[8-12], findings[ids],
                     moves[]+battlecard[][] | outlook[]+players[][]}
  → applyResult(): clamp and normalise                                   :1042-1070
  → advance(): plays log lines; marks each stage "passed" when its lines
               are shown, with no check evaluated                        :941-955
  → report view, claim register, claim panel                             :1133-1210
  → Save as HTML (downloads capability or Blob) | Let it lapse           :1086-1126
```

## Stage-by-stage map

Status key: **Missing**, **Mock** (returns fabricated placeholder data), **Simulated** (the model says it did the step, with no code check), **Partial**, **Implemented**. "Manual" shows how the reference runs did the step by hand.

| Stage | Path A (repo) | Path C (Vantage Point) | Manual reference runs (Path D) |
| --- | --- | --- | --- |
| **User input** | Implemented: company + region enum. `company` required (`server.js:17`). No length limit or escaping on the server | Implemented: mode, question, 5 fields, ceiling. `f-players`, `f-depth` and uploads are shown but not read | Amit gave the subject and confirmed the scope in chat |
| **Task interpretation** | Missing: the company name goes straight into the prompt (`aiClient.js:15`) | Partial: a regex decides whether the text is a name or a question (`:699`); a name prompt appears if the subject is missing | Done by hand at Scope |
| **Research planning (Scope)** | Missing | Partial: one LLM call writes the decision, boundary and frameworks as log lines plus one scoping question. No research questions, competitor criteria or evidence ceiling as data | Done: questions, definitions, ceiling, limitations (golden case §1) |
| **Source discovery** | Missing. The live path has no search tool | Simulated: the model writes "collect" log lines from its own knowledge. `RULES` says "You have NO web access" (`:968`) | Done: web search with a logged query list (golden case §22: 15 queries, one engine) |
| **Evidence retrieval** | Missing | Missing. `src: []` on every live claim (`:1058`) | Done: pages read. Archiving failed: 0 of 48 sources archived across both runs (checked in the xlsx) |
| **Extraction and normalisation** | Missing. The model returns free strings such as `TAM: 'USD 120B (mock)'` | Partial: claims come back as structured objects; the code clamps materiality to 1–5 and maps unknown labels (`:1047-1060`) | Done: passages quoted, units and fiscal years normalised |
| **Deduplication and entity resolution** | Missing | Missing | Done by judgement (syndication counted once, origin column). Brand grouping (iQOO inside vivo) is flagged in master prompt v2 §8 |
| **Analysis and scoring** | Missing. There are no scores at all | Partial: the model supplies the confidence breakdown; the code forces confidence to equal the breakdown sum, capped at 75, and forbids "Verified" (`:1047-1053`). The breakdown categories are free-form, not the five v2 components | Done: 5 components plus penalties per claim; arithmetic consistent in both xlsx files (checked: 0 mismatches, 0 label-band mismatches) |
| **Challenge (independent audit)** | Missing | Simulated: the same call that wrote the analysis also writes the "challenge" log lines, so it is not independent | Partial: done in the same Claude session as the drafting, so it is not independent either |
| **Report generation** | Implemented (mock): fixed sections rendered as JSON `<pre>` blocks; `scenarioSimulations` is returned but never rendered | Implemented: answer, limitations, findings, moves/outlook, table, claim register | Done: md/html/pdf + xlsx/csv registers |
| **Validation / quality gate** | Missing | Simulated: the "Quality gate passed; gaps disclosed on page one." line is written by the model or hard-coded (`:681, 748`). No gate is computed | Done by hand: 14-check table (golden case §17) |
| **Final output** | `{ok:true,data}` JSON. Not persisted, except the sample batch | HTML file on save, otherwise nothing | Files in `/mnt/project-files/mci/` |

## Per-stage details for the paths that run code

| Stage | Inputs | Outputs | Dependencies | Failure modes seen in code | Responsible module |
| --- | --- | --- | --- | --- | --- |
| Input (A) | `{company, region}` | request | Express, body-parser | Missing company gives 400 `{error}` with no `ok` field; a `region` outside the enum is accepted | `server.js:14-18` |
| LLM analysis (A) | company, region | analysis object | OpenAI API, axios | **A silent fallback to mock on any error or parse failure**: the caller cannot tell mock from live. `max_tokens 800` is small for an 8-key JSON, so truncation lands in the mock fallback. `GROK_API_KEY` is documented in the README but never read | `aiClient.js` |
| Batch (A) | `companies[]` | `data/insurance_samples.json` | fs-extra | Sequential with no per-item error isolation: one throw fails the batch. The file is overwritten on every run. `s.company` goes into `innerHTML` unescaped (`public/index.html:67,79`) | `server.js:27-53` |
| Scope (C) | brief + RULES | lines, question, 2 options | `window.claude` sample capability | `not_granted`, `rate_limited`, `invalid_json`, `refused`, `session_expired` mapped to messages (`:971-978`); stage shows "attention"; retry by the user | `liveScope` |
| 02–06 (C) | brief + scope choice | full study JSON | same | One long call with no partial checkpoint: any failure loses all of 02–06. A 5 s ticker only updates the elapsed time. More than 14 claims are cut silently (`:1047`) | `liveMain`, `applyResult` |
| Publish (C) | study | HTML string | downloads capability | Save declined leads to a toast, and the study lapses on leave | `saveStudy` |

## Path B: web scaffold

`Hero.jsx:14` calls `GET /api/insights?q=` and `mci-web/server/server.js:10-27` returns a fixed object (`query, summary, top_competitors[{name, relevance}], tam{value, currency, confidence}`). The result is shown as raw JSON. It does no research. The install is broken: `tailwindcss ^3.5.0` does not exist (`mci-web/package.json:20`), and `vite.config.js:2` imports `@vitejs/plugin-react`, which is not declared. The live-source plan intends this React app to become Vantage Point's front end (engine plan, build step 1).
