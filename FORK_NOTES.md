# Fork Notes — Digital Kingsmen customizations on top of Plane

This file documents every change this fork makes on top of upstream
`makeplane/plane`, so that future upstream merges know exactly what to
watch for. Keep it current.

Upstream remote: `git@github.com:makeplane/plane.git`
Our remote: `git@github.com:jonahjtr/plane.git`
Primary branch: `preview`

---

## Restore points

Before any risky schema/data work, we create:
- a git tag `pre-<feature>-<timestamp>` and branch `backup/pre-<feature>-<timestamp>` (pushed to origin)
- a full Postgres dump in `.backups/` (gitignored — contains real data, local only)

Latest before ProjectGroup work:
- tag/branch: `pre-project-groups-20260627-150216`
- DB dump: `.backups/plane-db-full-20260627-150216.sql`

Restore code: `git reset --hard pre-project-groups-20260627-150216`
Restore DB:   `cat .backups/plane-db-full-<ts>.sql | docker exec -i plane-db psql -U plane -d plane`

---

## Feature: Project Groups (sidebar folders for projects)

**Goal:** group the flat "Projects" sidebar list into named, workspace-wide
folders (e.g. "Clients", "Digital Kingsmen Ops"). A project belongs to at
most one group. Groups may nest exactly ONE level (group → subgroup). Groups
are workspace-scoped and visible to everyone in the workspace (no per-group
ACL yet — deferred). Projects can be moved between groups by drag or menu.

### Data model

New model `ProjectGroup` (table `project_groups`):
- `workspace` FK → Workspace (CASCADE)
- `name` CharField(255)
- `parent` self-FK, nullable (CASCADE) — enforces 1-level nesting in app logic
- `color` CharField, nullable — for the sidebar badge/dot
- `sort_order` FloatField — ordering within its level
- standard BaseModel fields (id uuid, created_by, updated_by, timestamps)
- soft-delete via existing mixin
- unique (name, parent, workspace) where deleted_at is null

New field on `Project`:
- `group` FK → ProjectGroup, nullable, `on_delete=SET_NULL`,
  `related_name="projects"`. Nullable so ungrouped projects keep working
  exactly as before (zero behavior change when feature unused).

**Nesting rule (enforced in serializer/view, not DB):** a ProjectGroup whose
`parent` is non-null may not itself be a parent. Max depth = 2.

### API surface (internal app API, `/api/workspaces/<slug>/project-groups/`)

- `GET    /api/workspaces/<slug>/project-groups/`            list groups (+subgroups) for workspace
- `POST   /api/workspaces/<slug>/project-groups/`            create group
- `PATCH  /api/workspaces/<slug>/project-groups/<id>/`       rename / recolor / reparent / reorder
- `DELETE /api/workspaces/<slug>/project-groups/<id>/`       delete group (projects fall back to ungrouped)

Project's `group` is set via the existing project PATCH endpoint
(`/api/workspaces/<slug>/projects/<id>/`) by adding `group` to the project
serializer + the project update view's allowed fields.

### Frontend

- `packages/types` — add `TProjectGroup` and a `group` field on the project type.
- `core/services/project/project-group.service.ts` — CRUD service.
- `core/store/project/project-group.store.ts` — MobX store (grouped projects,
  CRUD actions, optimistic move).
- `core/components/workspace/sidebar/project-groups/` — grouped sidebar UI:
  replaces the single flat "Projects" disclosure with one disclosure per
  group (and nested subgroup), each with a color dot/badge; ungrouped
  projects render under a default "Ungrouped" section; a filter/search at the
  top; drag a project between groups to reassign.

### Files touched (keep this list current for merge conflict triage)

Backend:
- `apps/api/plane/db/models/project.py`            (+ `group` FK on Project)
- `apps/api/plane/db/models/project_group.py`      (NEW model)
- `apps/api/plane/db/models/__init__.py`           (export ProjectGroup)
- `apps/api/plane/db/migrations/XXXX_project_groups.py`  (NEW migration)
- `apps/api/plane/app/serializers/project.py`      (+ group field; ProjectGroupSerializer)
- `apps/api/plane/app/serializers/__init__.py`     (export serializer)
- `apps/api/plane/app/views/project/group.py`      (NEW views) or in base.py
- `apps/api/plane/app/views/__init__.py`           (export views)
- `apps/api/plane/app/urls/project.py`             (+ routes)

Frontend:
- `packages/types/src/project/projects.ts`         (+ TProjectGroup, group field)
- `apps/web/core/services/project/project-group.service.ts` (NEW)
- `apps/web/core/services/project/index.ts`        (export)
- `apps/web/core/store/project/project-group.store.ts`      (NEW)
- `apps/web/core/store/...root`                    (wire store)
- `apps/web/core/hooks/store/use-project-group.ts` (NEW hook)
- `apps/web/core/components/workspace/sidebar/projects-list.tsx`  (grouped render)
- `apps/web/core/components/workspace/sidebar/project-groups/*`   (NEW components)

### Merge-conflict risk
HIGH on `projects-list.tsx` (we rewrite its render), `project.py` model/serializer,
and the project store root. MEDIUM on urls/views `__init__` exports. When pulling
upstream, reapply our `group` field + the grouped sidebar on top of their version.
