# Agent Development Guide

## Commands

- `pnpm dev` - Start all dev servers (web:3000, admin:3001)
- `pnpm build` - Build all packages and apps
- `pnpm check` - Run all checks (format, lint, types)
- `pnpm check:lint` - OxLint across all packages
- `pnpm check:types` - TypeScript type checking
- `pnpm fix` - Auto-fix format and lint issues
- `pnpm turbo run <command> --filter=<package>` - Target specific package/app
- `pnpm --filter=@plane/ui storybook` - Start Storybook on port 6006

## Code Style

- **Imports**: Use `workspace:*` for internal packages, `catalog:` for external deps
- **TypeScript**: Strict mode enabled, all files must be typed
- **Formatting**: oxfmt, run `pnpm fix:format`
- **Linting**: OxLint with shared `.oxlintrc.json` config
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Error Handling**: Use try-catch with proper error types, log errors appropriately
- **State Management**: MobX stores in `packages/shared-state`, reactive patterns
- **Testing**: All features require unit tests, use existing test framework per package
- **Components**: Build in `@plane/ui` with Storybook for isolated development

## Backend tests (Docker)

The Django/pytest suite for `apps/api` runs in an isolated stack defined by `docker-compose-test.yml` at the repo root.

Prereq (once): `./setup.sh` — generates `apps/api/.env` from `.env.example`.

- Full suite: `docker compose -f docker-compose-test.yml up --build --abort-on-container-exit --exit-code-from api-tests`
- Subset: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit`
- Teardown: `docker compose -f docker-compose-test.yml down -v`

See `apps/api/tests/RUNNING_TESTS.md` for the full walkthrough and troubleshooting; see `apps/api/tests/TESTING_GUIDE.md` for test conventions and fixtures.

---

# Working on this fork (Digital Kingsmen)

This is a **self-hosted fork** of `makeplane/plane`. Everything above applies
upstream-style; everything below is fork-specific.

## What this fork adds

- **Project Groups (sidebar folders)** — workspace-scoped, one-level nesting,
  emoji/icon+color per group. See `FORK_NOTES.md` for the full list of
  files changed and the merge-conflict risk per file. Source of truth for
  the feature: `apps/web/core/components/workspace/sidebar/project-groups/`,
  `apps/web/core/store/project/project-group.store.ts`,
  `apps/api/plane/db/models/project_group.py`, migrations `0122` and `0123`.
- **Top-nav refresh button** + `start.sh`/`stop.sh` workflow scripts.
- **`FORK_NOTES.md`** at the repo root — read this before pulling upstream
  or extending a fork feature. It lists every file the fork touches and
  what to expect during a merge.

## Hard rules for agents working in this fork

1. **NEVER answer questions about Plane state from memory or skill docs.**
   State can shift between messages (other agents, cron, auto-pickup
   workers, the user). Always re-fetch with the tools (`mcp_plane_*`, REST
   API) in the current turn. Treat any claim about workspace contents as
   unverified until a fresh tool call backs it.

2. **NEVER hardcode project lists, group lists, ticket counts, or
   workspace state in this file, in any skill, in conversation, or in
   code comments.** All of that is live data. Re-query every time.

3. **The self-hosted stack uses baked Docker images with no source
   mount.** Editing files in `~/Developer/plane` does NOT hot-reload the
   running `api`/`web` containers. To land a backend schema change:
   1. Edit source under `apps/api/...`
   2. `docker cp` the edited files into the running `api` container at
      `/code/...`
   3. `docker exec api python manage.py makemigrations db --name <name>`
   4. `docker cp` the generated migration back out to the source tree
   5. `docker exec api python manage.py migrate db <migration>` (verify
      it's additive/safe; take a `pg_dump` first)
   6. `docker compose build api web` then
      `docker compose up -d --no-deps --force-recreate api worker
      beat-worker web` to bake the change in so it survives restarts.

4. **The `api` container imports views via absolute paths**
   (`from plane.app.views.base import BaseViewSet`), NOT `from .. import
   BaseViewSet`. The relative form causes a circular import at app-load
   time. Match the existing absolute-import convention in new view
   modules.

5. **Git push policy (per the user):** never `git push` to `origin/preview`
   or `origin/main` without explicit "push it" / "go ahead" in the same
   conversation. Edits, local commits, dev server, builds, Plane updates
   are free. Push, PR open, merge, force-push, production deploy are
   gated.

6. **The verify-before-push gate for client work:** `node_modules/.bin/tsc
   --noEmit` must be 0, `pnpm turbo run build --filter=web` must succeed,
   `git status -sb` must show only the intended changes, the branch must
   be the right one (`git branch --show-current`), and there must be no
   uncommitted changes from a parallel agent. If the user said "if all
   good to go, push it", the gate is explicit permission to push on
   success — don't ping for permission again.

## Backup & restore convention

Before any risky schema/data work, create a restore point:

```bash
TS=$(date +%Y%m%d-%H%M%S)
git tag -a "pre-<feature>-$TS" -m "Restore point before <feature>"
git branch "backup/pre-<feature>-$TS"
docker exec plane-db pg_dump -U plane -d plane > .backups/plane-db-full-$TS.sql
git push origin "pre-<feature>-$TS" "backup/pre-<feature>-$TS"  # tag+branch only, not the DB dump
```

`.backups/` is gitignored at the root level (defensive) and also has its
own inner `.gitignore`. DB dumps contain real data and must NEVER be
pushed.

Restore: `git reset --hard pre-<feature>-<ts>` reverts code;
`cat .backups/plane-db-full-<ts>.sql | docker exec -i plane-db psql -U
plane -d plane` restores the DB.

## Project Groups (DK fork only) — quick reference

- **Model:** `project_groups` (workspace-scoped; one-level nesting; has
  `name`, `color`, `logo_props` (emoji or material icon, same JSON shape
  Project uses), `sort_order`, `parent` (self-FK))
- **Project membership:** `Project.group` is a nullable FK. NULL =
  ungrouped.
- **Assign a project to a group:** PATCH the project with `{"group":
  "<uuid>"}` (or `null` to unassign). This goes through the normal
  project PATCH endpoint — no special endpoint.
- **Group CRUD:** `/api/workspaces/<slug>/project-groups/` (GET/POST),
  `/api/workspaces/<slug>/project-groups/<id>/` (PATCH/DELETE). Auth via
  `X-API-Key`. Note this is the `/api/` (internal app) path, not
  `/api/v1/`.
- **Not exposed by `@makeplane/plane-mcp-server`** — the MCP tools don't
  know about groups. Always reach the group API via REST, not
  `mcp_plane_*`.
- **Sidebar UX:** grouped disclosures with color/icon glyphs, per-project
  "move to" menu, drag-and-drop a project between groups, drag-to-reorder
  groups within the same level, filter input, count badges, tree-guide
  indentation for subgroups (one level deep).

## What NOT to commit

- `.env` files (any `apps/*/.env` or root `.env`) — these contain DB
  passwords, API keys, and `PLANE_API_KEY`. The root `.gitignore` blocks
  them; if you ever see a `git add` suggesting one, stop and `git rm
  --cached` it.
- `.backups/*.sql` — DB dumps with real data.
- Local Claude/Cursor/Aider scratch directories.
- Hardcoded paths under `/Users/...` in any source file (use `~` or env
  vars instead).

## Style reminders specific to this fork

- The fork's `start.sh` opens a Plane-focused Hermes session
  (`hermes profile use plane; exec hermes chat "$@"`). If you need a
  different profile, edit and reload.
- Husky pre-commit runs `pnpm exec oxfmt`. The formatter has been seen
  to SIGKILL on heavy TSX files; if that happens, use
  `git commit --no-verify` for legitimate work and note it in the commit
  body. Do not bypass the hook for unrelated reasons.
- When building a new fork feature, add a section to `FORK_NOTES.md` in
  the same commit that lands the feature. That doc is the durable
  record of what the fork changes — skill files are durable too, but
  `FORK_NOTES.md` lives in the repo so any agent with a clone sees it.

