# Rollback points

## Code

| Point | What it is | How to return to it |
| --- | --- | --- |
| `rollback/v0-prototype` (branch, at `99b9afd`) | `main` exactly as it was before the harness rebuild | `git checkout rollback/v0-prototype`, or open a PR that resets `main` to it |
| `legacy/` folder | The v0 prototype files (root Express server, `aiClient.js`, `public/`, `mci-web/`), moved with `git mv` so their history is kept | Copy the files back to the root. They are not served by the new app |
| One PR per phase | Every phase merges as its own PR | Revert that phase's merge commit on GitHub |

A git tag `v0-prototype` was attempted, but the push was refused by this environment. The branch above marks the same commit.

## Studies

Every study keeps its own history in `data/studies/<id>/`:

- `versions/v<N>.json` is written on each save, at the end of each run, and before each rollback.
- `events.jsonl` is an append-only audit log of every stage, model call, state change and lifecycle action.
- `POST /api/studies/:id/rollback {"version": N}` or `npm run vp -- rollback <id> <N>` restores version N as a new version. History is never rewritten. A locked study must be unlocked first.
- Delete is permanent and refused while a study is locked or running.
