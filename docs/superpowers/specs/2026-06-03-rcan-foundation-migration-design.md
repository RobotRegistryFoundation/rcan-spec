# RCAN → Robot Registry Foundation migration — design

**Date:** 2026-06-03
**Status:** Approved (brainstorming) — pending writing-plans
**Anchor repo:** rcan-spec (the CI hub). Spans 8 repos.

## 1. Goal & motivation

Give the RCAN **standard + reference SDKs** a vendor-neutral home in the
`RobotRegistryFoundation` GitHub org, alongside `robot-md` and the registry
the protocol resolves against (`rcan.dev` / RRN). Today the RCAN trio lives in
`continuonai` (the commercial org, beside OpenCastor / continuonos /
Continuon-Cloud), which undercuts the "anyone can build on this standard"
story.

This is not a new direction: `rcan-spec/docs/governance/robot-registry-foundation.md`
already states *"the RRF stewards the RCAN protocol specification."* This
migration makes the repo home match the governance already written down.

Triggered while setting up OIDC Trusted Publishing (a stale PyPI
"pending trusted publisher" email). Because OIDC publishers are keyed to the
GitHub **owner**, the publishers must be registered under the new owner — so
the org move should happen *before* registering them, not after.

## 2. Scope

**Transfer set (3 repos — move org):**
`continuonai/rcan-spec`, `continuonai/rcan-py`, `continuonai/rcan-ts`.

**Edit set (8 repos — touch files):** the trio (transfer + edit) plus 5
consumers that only need their CI `uses:` lines re-pointed:
- `craigm26/OpenCastor`
- `RobotRegistryFoundation/robot-md`
- `RobotRegistryFoundation/robot-md-gateway`
- `RobotRegistryFoundation/robot-md-mcp`
- `craigm26/RobotRegistryFoundation`

Worktrees `robot-md-redesign`, `robot-md-wt-export-to`, `robot-md-gateway-wt-21`
share the parent repos' `.git` → covered automatically. The plugin-cache copy
under `.claude/plugins/cache/...` is not a live repo → ignored.

**Unaffected:** every `from rcan import …` / `pip install rcan` /
`npm install rcan-ts` consumer. Repo transfer does **not** rename published
packages, so all code/import dependencies keep working untouched.

## 3. Dependency taxonomy (why the risk is bounded)

Each consumer depends on the trio in one of three ways; only one is risky.

| Cat | Kind | Effect of transfer | Examples |
|-----|------|--------------------|----------|
| **C** | Published-package import | **None** — package names unchanged | OpenCastor `from rcan import RCANMessage`; robot-md `from rcan import sign_body`; gateway `from rcan.audit_bundle import canonical_json` |
| **B** | Doc / badge / link URL | Redirected (cosmetic) | READMEs, CHANGELOGs, SECURITY links |
| **A** | **Shared CI Action `uses:`** | **Breaks if old name is ever recreated** → must update | every release pipeline's `uses: continuonai/rcan-spec/.github/actions/emit-version-tuple@v3.2.3` |

**Why update Cat-A rather than trust redirects:** GitHub documents redirects
for links and git operations, but not for Actions `uses:`. After transfer the
old name `continuonai/rcan-spec` becomes *available*; if anyone (or an
attacker) re-creates it, every consumer's `uses:` silently re-points to the new
repo at that name — a supply-chain hazard for a CI action. Treat the redirect
as a safety net for the migration window only; the end state must have **zero**
`continuonai/rcan` refs in tracked CI files.

### CI-hub actions (two, not one)
1. `rcan-spec/.github/actions/emit-version-tuple` — referenced `@v3.2.3` by the
   trio + all 5 consumers (signed version-tuple emit on release).
2. `rcan-py/.github/actions/validate-rcan` — referenced `@main`, documented in
   `rcan-py/docs/ci-integration.md` for *external* users' CI. We don't control
   external callers (they rely on redirect), but our own repos must be swept and
   the docs updated to the new owner.

> Implementation note: reference locations below were captured at discovery
> time; the rcan-py/rcan-ts `publish.yml` line numbers shifted after the OIDC
> edit. **Re-grep at implementation time** rather than trusting line numbers:
> `git grep -n 'continuonai/rcan'` per repo.

## 4. Method

GitHub **repository transfer** (`Settings → Transfer`, or `gh api -X POST
/repos/continuonai/<repo>/transfer -f new_owner=RobotRegistryFoundation`).
Preserves issues, PRs, wiki, stars, watchers, full git history, **tags +
releases**, and per GitHub docs *"webhooks, services, secrets, or deploy keys …
remain associated after the transfer."* Creates URL redirects.

**Approaches considered:**
- **(1) Coordinated transfer + immediate ecosystem sweep — CHOSEN.** Transfer,
  then immediately update all Cat-A refs across the 8 repos, register OIDC
  publishers under the new owner, verify. Redirect covers the brief window.
- (2) Transfer + rely on redirects, update lazily. Rejected: redirect
  impermanence = silent CI fragility / supply-chain risk; also leaves the org
  inconsistent, defeating the goal.
- (3) Decouple the actions first (publish to Marketplace / vendor them).
  Rejected: over-engineered (YAGNI) for a one-time move.

## 5. Plan (phases)

### Phase 0 — Pre-flight (no changes)
- Confirm admin on `continuonai` (source) and create-repo rights on
  `RobotRegistryFoundation` (target). Both are in the operator's org list.
- Snapshot each trio repo's **Actions secrets** and the `pypi` **environment**
  (names + protection rules) so we can verify post-transfer. Trio secrets seen:
  `PYPI_TOKEN`, `NPM_TOKEN`, `RCAN_PY_RELEASE_{RAN,PQ_PRIV,KID,PRIV}`,
  `RCAN_TS_RELEASE_{RAN,PQ_PRIV,KID,PRIV}` (+ any rcan-spec notify token).
- **Freeze releases ecosystem-wide** for the migration window (no `v*` tags /
  release dispatches on the 8 repos until the sweep is verified).

### Phase 1 — Transfer the 3 repos
- Transfer `rcan-spec`, `rcan-py`, `rcan-ts` → `RobotRegistryFoundation`.
- Update local git remotes (`git remote set-url origin …RobotRegistryFoundation/<repo>.git`).
- Sanity-check tags/releases/secrets/environment landed (Phase 0 snapshot).

### Phase 2 — Re-point the CI hub (load-bearing)
Rewrite, across the 8 repos, in tracked CI files:
- `uses: continuonai/rcan-spec/.github/actions/emit-version-tuple@v3.2.3`
  → `uses: RobotRegistryFoundation/rcan-spec/.github/actions/emit-version-tuple@v3.2.3`
  - trio: `rcan-py/.github/workflows/publish.yml` (×2),
    `rcan-ts/.github/workflows/publish.yml` (×2)
  - consumers: `OpenCastor/.github/workflows/release.yml` (×2),
    `robot-md/.github/workflows/release.yml` (×2),
    `robot-md-gateway/.github/workflows/release.yml` (×2),
    `robot-md-mcp/.github/workflows/release.yml` (×2),
    `RobotRegistryFoundation/.github/workflows/release.yml`
- Intra-trio `gh ... --repo continuonai/rcan-*`:
  `rcan-py/.github/workflows/publish.yml` (`--repo continuonai/rcan-py`),
  `rcan-spec/.github/workflows/release-notify.yml`
  (`--repo continuonai/rcan-py`, `--repo continuonai/rcan-ts`).
- The OIDC comment I added in `rcan-ts/publish.yml` ("org continuonai") → update.
- `validate-rcan` action references in `rcan-py/docs/ci-integration.md` (and any
  in-repo `uses:`) → new owner.

### Phase 3 — Publishing trust under the new owner
- Register OIDC trusted publishers (operator, browser):
  - PyPI `rcan`: owner `RobotRegistryFoundation`, repo `rcan-py`, workflow
    `publish.yml`, environment **`pypi`** — **from the PyPI account that owns
    `rcan`** (note the cmmerry@ucdavis vs craigm26@gmail account ambiguity from
    the original OIDC task).
  - npm `rcan-ts`: org `RobotRegistryFoundation`, repo `rcan-ts`, workflow
    `publish.yml`, environment **blank**.
- Verify `RCAN_*_RELEASE_*` secrets + the `pypi` environment survived the
  transfer; re-add any that didn't (env secrets are not documented as
  transferred).

### Phase 4 — Metadata + governance polish
- Package metadata → new owner: `rcan-py/pyproject.toml` `Repository`;
  `rcan-ts/package.json` `repository`/`bugs`/`homepage`; `rcan-ts/src/index.ts`
  `@see`.
- READMEs (badges + cross-links), `SECURITY.md` advisory links, `CLAUDE.md`
  repo refs across the trio.
- Governance doc `rcan-spec/docs/governance/robot-registry-foundation.md`
  ("hosted at github.com/continuonai/rcan-spec" → RRF).
- **Governance polish:** add `CODEOWNERS` (foundation maintainers), a
  `CONTRIBUTING` pointer, and a one-line *"Stewarded by the Robot Registry
  Foundation"* note in each trio README.
- Consumer-repo doc/badge links (Cat-B): opportunistic, redirect-covered.

### Phase 5 — Verify (exit gate)
- `workflow_dispatch` dry-run / test release confirming: OIDC publish works
  under the new owner, and `emit-version-tuple` resolves from
  `RobotRegistryFoundation/rcan-spec`.
- Grep gate: **zero** matches for `continuonai/rcan` in tracked CI files
  (`*.yml`/`*.yaml`) across all 8 repos.
- Unfreeze releases.

## 6. Out of scope / non-goals
- **Token retirement is a SEPARATE follow-up** (operator decision): deleting
  `PYPI_TOKEN`/`NPM_TOKEN` repo secrets + revoking the tokens happens *after* a
  verified OIDC release under the new owner — tracked elsewhere, not in this
  migration.
- No package renames or npm scoping (rcan-ts deliberately stays unscoped; PyPI
  stays `rcan`).
- Leave `rcan://…/continuonai/…` example URIs — there `continuonai` is a
  **manufacturer namespace**, not a GitHub org.
- Leave historical CHANGELOG entries (e.g. `@continuonai/rcan-ts`) as a record.
- The OpenAPI schema `example: "github:continuonai"` is an illustrative value —
  optional to touch.

## 7. Risks → mitigations
| Risk | Mitigation |
|------|-----------|
| `uses:` redirect impermanence / old-name recreation (supply-chain) | Phase 2 sweep to zero refs; exit-gate grep |
| A release fires mid-window | Phase 0 ecosystem freeze |
| Env secrets / `pypi` environment not carried over | Phase 3 verify + re-add |
| OIDC publisher registered from the wrong/old owner or wrong PyPI account | Phase 3 explicit owner + account check |
| External callers of `validate-rcan@main` (outside our control) | Redirect covers them; update our docs to new owner |

## 8. Rollback
Repo transfers are reversible (transfer back to `continuonai`). Before a
verified OIDC release, publishing still works via the existing token path
(unchanged until the separate retirement step), so a mid-migration abort leaves
publishing functional. Workflow edits are ordinary commits → revert.

## 9. Prerequisites / open items
- Operator performs the GitHub transfers and the PyPI/npm publisher
  registrations (cannot be scripted headlessly here).
- Resolve which PyPI account owns `rcan` before registering its publisher.
- Confirm no in-flight release is mid-pipeline at freeze time.
