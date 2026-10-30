# Vantage Point research harness

Vantage Point is The Continuum Lab's competitive intelligence engine. This repo is the server-side harness. It turns a research question into a scored, source-checked study and renders it as an interactive HTML report.

## Authority order

When documents disagree, the higher item wins:

1. `docs/harness/decisions.md`, the approved decisions.
2. `config/*.json`: the rubric, source tiers, frameworks and harness limits.
3. `docs/harness/*.md`, the specification.
4. Master prompt v2 and the framework doc, which live outside the repo.

## Rules for changing this code

- **Code decides, models propose.** Source tiers, quote checks, statuses, calculations, score totals, contradictions and the quality gate are computed in code. Never let a model's number or label through unchecked.
- **No mock fallback.** A missing key or failed call raises a typed `RunError`. The run stops, visibly. It never returns made-up data.
- **One switch per provider.** `SEARCH_PROVIDER` and `LLM_PROVIDER` in `.env` are read only in `src/config.js`. To add a provider, write an adapter in `src/providers/<kind>/` and register it in that folder's `index.js`. Nothing else changes.
- **Fetched content is untrusted.** It goes to a model only through `untrustedSource()`. Never put page text in a system prompt.
- **The workflow is data.** Stage order and loops are in `src/core/graph.js`, and state changes go through `src/core/state.js`. Don't hard-code stage order anywhere else.
- **Prompts are versioned.** To change a prompt, add `prompts/<stage>.v2.md` and bump `prompts.<stage>` in `config/harness.config.json`. Never edit a released prompt in place.
- **Rubric changes** go in `config/scoring-rubric.json` with a version bump. The register tests must still pass.
- **Keep a backup before replacing a page.** Keep the old page working (e.g. `public/classic.html` at `/classic`) and add a described row to the top of the table in `ROLLBACK.md`.
- **Locked studies are read-only.** Nothing may write to one until it is unlocked.
- Keys live in `.env` only. Never commit them or paste them in chat.

## Layout

```
config/        rubric, source tiers, frameworks, harness limits (edit these, not code)
prompts/       versioned stage prompts
src/config.js  the only reader of process.env
src/core/      graph, state machine, runner, retry, budgets, errors
src/stages/    understand, lookup+recheck, scope, collect, validate, analyse, challenge, publish
src/scoring/   confidence, recommendation, status rules, safe calculator
src/gates/     the 14-check quality gate
src/library/   prior-research lookup and recheck
src/store/     file study store: versions, rollback, save/lock/unlock/delete, page snapshots
src/providers/ search (tavily|brave|exa|fixture), llm (anthropic|openai|fixture), fetch
src/report/    interactive HTML report and SVG charts
src/server/    HTTP API
public/        minimal web page
eval/          offline synthetic study and planted-error eval
legacy/        the v0 prototype, kept for reference only and not served
```

## Commands

- `npm test` runs every test offline. No network and no keys are needed.
- `npm run eval` runs the synthetic Tata vs Mahindra study and prints the planted-error pass rate.
- `npm start` serves the API and web page on `PORT`. It needs `.env`; see `.env.example`.
- `npm run vp -- list|show|save|lock|unlock|delete|versions|rollback|report <id>` runs lifecycle commands from the command line.

Run `npm test` before every commit. A change that breaks the register or planted-error tests is a methodology change and needs Amit's review.
