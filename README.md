# Vantage Point

A competitive intelligence research engine from The Continuum Lab. Each study answers one research question. Every claim in it is checked against its source by code, scored on a fixed rubric and audited by an independent pass. The result is one interactive HTML report.

## Quick start

```bash
npm install
npm test          # offline, no keys
npm run eval      # synthetic Tata vs Mahindra study + planted-error pass rate
cp .env.example .env   # add ANTHROPIC_API_KEY and your search key
npm start         # http://localhost:3000
```

## Switching the search provider

Set one line in `.env`:

```
SEARCH_PROVIDER=tavily   # or brave, exa, fixture
```

Then set that provider's key in `.env`. Nothing else changes.

The model provider works the same way: `LLM_PROVIDER=anthropic` (default) or `openai`, with `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

## How a study runs

```
read the question ─▶ library check ─▶ scope ─▶ (you confirm) ─▶ collect ─▶ validate ─▶ analyse ─▶ challenge ─▶ publish
                         │                                       ▲          │                     │
                         └─▶ re-check prior study                └─ loop ───┘                     └─ loop for counter-evidence
                                ├─ nothing material changed ─▶ reuse it, re-stamped
                                └─ material change ─▶ full redo, starting from the prior sources
```

Only the question is required. "Read the question" uses the fast model to fill in anything left blank (company, your company, perspective, geography, period); what you type under More options always wins. You see all of it on the scope confirmation card before any searching starts. The previous full form is kept at `/classic`.

The quality gate ends each run:

- A Fail on checks 1, 2, 4, 5, 11 or 12 blocks publication.
- Partial results are published, and disclosed on page one.

Studies can be saved, locked (read-only), unlocked, deleted and rolled back to any earlier version.

## Documents

- `docs/harness/decisions.md` records the approved decisions and the phase plan.
- `docs/harness/scoring-rubric.md` explains the rubric in plain language.
- `CLAUDE.md` gives the rules for changing the code.
- `ROLLBACK.md` lists the rollback points.
