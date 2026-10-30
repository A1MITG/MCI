# Rollback points

## Roll back table

Newest first. Before any change that replaces a page or the app's behaviour, add a row here and keep the old version as a backup.

| # | Date | Rollback point | Description | How to go back |
| --- | --- | --- | --- | --- |
| 6 | 2026-10-30 | `/classic` page (`public/classic.html`) | The previous full form (company, my company, perspective, depth, geography, period), kept as a working backup page after the form was cut to one question box | Open http://localhost:3000/classic. To make it the main page again, copy `public/classic.html` over `public/index.html` |
| 5 | 2026-10-30 | Commit `c73ebba` on `harness/openai-provider` | The last version before the one-question form: OpenAI provider, the Windows fixes, and the stop-at-once message for an OpenAI account with no credit | `git checkout c73ebba`, or revert the form commit |
| 4 | 2026-10-30 | Commit `17531fd` on `harness/openai-provider` | OpenAI provider plus the Windows fixes (file rename retry, eval entry point). 46 tests pass on Windows and Linux | `git checkout 17531fd` |
| 3 | 2026-10-30 | Commit `d942eb0` on `harness/openai-provider` | OpenAI provider added behind `LLM_PROVIDER`, before the Windows fixes | `git checkout d942eb0` |
| 2 | 2026-10-30 | `main` at `355f32c` (PR #1) | Phase 1 harness as merged: Claude only, full form | `git checkout main` |
| 1 | 2026-10-25 | Branch `rollback/v0-prototype` (`99b9afd`) and the `legacy/` folder | The original v0 prototype, before the harness rebuild. `legacy/` holds the same files, moved with `git mv` so their history is kept, and they are not served | `git checkout rollback/v0-prototype`, or open a PR that resets `main` to it |

Every phase also merges as its own PR, so a whole phase can be undone by reverting its merge commit on GitHub. A git tag `v0-prototype` was attempted, but the push was refused by this environment; the branch in row 1 marks the same commit.

Amit's PC keeps its own copy of this table, plus local page copies and the branch `rollback/pre-simple-form` (`17531fd`), in `C:\Projects\AI_Factory\vantage-point-backups\`.

## Studies

Every study keeps its own history in `data/studies/<id>/`:

- `versions/v<N>.json` is written on each save, at the end of each run, and before each rollback.
- `events.jsonl` is an append-only audit log of every stage, model call, state change and lifecycle action.
- `POST /api/studies/:id/rollback {"version": N}` or `npm run vp -- rollback <id> <N>` restores version N as a new version. History is never rewritten. A locked study must be unlocked first.
- Delete is permanent and refused while a study is locked or running.
