# RCAN → Robot Registry Foundation migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the RCAN trio (`rcan-spec`, `rcan-py`, `rcan-ts`) from the `continuonai` org to `RobotRegistryFoundation`, re-point every CI reference across 8 repos, register OIDC trusted publishers under the new owner, and verify — with published package names unchanged.

**Architecture:** GitHub repo transfer (preserves history/issues/tags/releases/secrets, creates redirects) followed by an ecosystem-wide CI-ref sweep. The risk surface is one class of dependency only — the shared GitHub Actions hosted in the trio (`emit-version-tuple` in rcan-spec, `validate-rcan` in rcan-py); code imports of the published `rcan`/`rcan-ts` packages are unaffected. Redirects cover the migration window; the end state must contain zero `continuonai/rcan` references in tracked CI/metadata files.

**Tech Stack:** GitHub (repo transfer API + Actions), `gh` CLI, git, PyPI + npm OIDC Trusted Publishing.

**Spec:** `docs/superpowers/specs/2026-06-03-rcan-foundation-migration-design.md`

**Legend:** `[OPERATOR]` = a human-only action (web UI / privileged API). `[AGENT]` = scriptable by the executing agent. Pushing/PR-merging is operator-gated.

---

## Repo & ref inventory (the complete edit set)

| Repo | Remote (current) | Role | Refs to fix |
|------|------------------|------|-------------|
| rcan-spec | continuonai/rcan-spec | transfer + edit | `release-notify.yml` (`--repo continuonai/rcan-py`, `--repo continuonai/rcan-ts`); `.github/actions/emit-version-tuple/README.md` (usage example) |
| rcan-py | continuonai/rcan-py | transfer + edit | `publish.yml` (`--repo continuonai/rcan-py` ×4, `uses: …rcan-spec…` ×2); `pyproject.toml` Repository; `docs/ci-integration.md` (validate-rcan refs) |
| rcan-ts | continuonai/rcan-ts | transfer + edit | `publish.yml` (`uses: …rcan-spec…` ×2, OIDC comment "org continuonai"); `package.json` repository/bugs/homepage; `src/index.ts` @see |
| OpenCastor | craigm26/OpenCastor | edit only | `release.yml` (`uses: …rcan-spec…` ×2) |
| robot-md | RobotRegistryFoundation/robot-md | edit only | `release.yml` ×2 |
| robot-md-gateway | RobotRegistryFoundation/robot-md-gateway | edit only | `release.yml` ×2 |
| robot-md-mcp | RobotRegistryFoundation/robot-md-mcp | edit only | `release.yml` ×2 |
| RobotRegistryFoundation | craigm26/RobotRegistryFoundation | edit only | `release.yml` ×1 |

**Canonical substitution (apply only to listed files, never CHANGELOG):**
```
continuonai/rcan-spec → RobotRegistryFoundation/rcan-spec
continuonai/rcan-py   → RobotRegistryFoundation/rcan-py
continuonai/rcan-ts   → RobotRegistryFoundation/rcan-ts
```

**Must NOT change:** `rcan://…/continuonai/…` example URIs (manufacturer namespace); historical `@continuonai/rcan-ts` CHANGELOG entries.

---

## Phase 0 — Pre-flight (no repository changes)

### Task 0.1: [OPERATOR] Confirm rights + snapshot secrets/environment

- [ ] **Step 1: Confirm transfer rights**
Verify you are an owner/admin of `continuonai` (source) and can create repos in `RobotRegistryFoundation` (target). Both appear in `gh api /user/orgs --jq '.[].login'`.

- [ ] **Step 2: Snapshot trio secrets + environment (the "before")**

Run:
```bash
for r in rcan-spec rcan-py rcan-ts; do
  echo "== $r secrets =="; gh secret list --repo continuonai/$r
  echo "== $r environments =="; gh api repos/continuonai/$r/environments --jq '.environments[].name' 2>/dev/null
done
```
Expected: lists include `RCAN_PY_RELEASE_*` / `RCAN_TS_RELEASE_*` (+ `PYPI_TOKEN`/`NPM_TOKEN`) and rcan-py shows a `pypi` environment. **Save this output** — it is the checklist for Phase 3 verification.

### Task 0.2: [OPERATOR] Freeze releases

- [ ] **Step 1:** Announce a release freeze across all 8 repos for the migration window — no `v*` tag pushes and no `Release`/`publish_npm` workflow dispatches until Phase 5 unfreeze. (No command; coordination only. If a release is mid-pipeline, wait for it to finish before Phase 1.)

### Task 0.3: [AGENT] Record the baseline ref inventory

- [ ] **Step 1: Capture current refs as the known "before"**

Run (from `~`):
```bash
for r in rcan-spec rcan-py rcan-ts OpenCastor robot-md robot-md-gateway robot-md-mcp RobotRegistryFoundation; do
  echo "## $r"; git -C $r grep -nI 'continuonai/rcan' -- '.github/**' 'pyproject.toml' 'package.json' 'src/index.ts' 'docs/ci-integration.md' 2>/dev/null
done | tee /tmp/rcan-migration-before.txt
```
Expected: non-empty matches in every repo (matches the inventory table above).

- [ ] **Step 2: Commit nothing** — this is a read-only baseline; the file lives in `/tmp`.

---

## Phase 1 — Transfer the 3 repos

### Task 1.1: [OPERATOR] Transfer rcan-spec, rcan-py, rcan-ts

- [ ] **Step 1: Transfer each repo to RobotRegistryFoundation**

Run (web UI alternative: each repo → Settings → "Transfer ownership"):
```bash
for r in rcan-spec rcan-py rcan-ts; do
  gh api --method POST repos/continuonai/$r/transfer -f new_owner=RobotRegistryFoundation
done
```
Expected: HTTP 202 each. (Org-to-org transfer may require accepting in the target org UI.)

- [ ] **Step 2: Verify each landed with history/tags/releases/secrets**

Run:
```bash
for r in rcan-spec rcan-py rcan-ts; do
  echo "== $r =="
  gh repo view RobotRegistryFoundation/$r --json name,isPrivate --jq '.name'
  gh release list --repo RobotRegistryFoundation/$r | head -3
  gh secret list --repo RobotRegistryFoundation/$r
done
```
Expected: repo resolves under the new owner; releases present; secrets list matches the Phase 0 snapshot. **Note any missing secret** for Phase 3.

### Task 1.2: [AGENT] Re-point local remotes

- [ ] **Step 1: Update each local clone's origin**

Run:
```bash
for r in rcan-spec rcan-py rcan-ts; do
  git -C ~/$r remote set-url origin https://github.com/RobotRegistryFoundation/$r.git
  echo "$r -> $(git -C ~/$r remote get-url origin)"
done
```
Expected: all three print `…RobotRegistryFoundation/…`.

- [ ] **Step 2: Verify fetch works through the new remote**

Run: `git -C ~/rcan-spec ls-remote --heads origin >/dev/null && echo OK`
Expected: `OK`.

---

## Phase 2 — Re-point the CI hub (load-bearing)

> For each repo: create a branch, apply the file-scoped substitution, verify **zero** `continuonai/rcan` refs remain in the touched files, commit. Pushing/PR is operator-gated (Step "push").

### Task 2.1: [AGENT] rcan-spec CI refs

**Files:** Modify `~/rcan-spec/.github/workflows/release-notify.yml`, `~/rcan-spec/.github/actions/emit-version-tuple/README.md`

- [ ] **Step 1: Branch**
```bash
cd ~/rcan-spec && git checkout -b chore/rrf-org-ci-refs master
```

- [ ] **Step 2: Apply substitution to the two files only**
```bash
sed -i 's#continuonai/rcan-py#RobotRegistryFoundation/rcan-py#g; s#continuonai/rcan-ts#RobotRegistryFoundation/rcan-ts#g; s#continuonai/rcan-spec#RobotRegistryFoundation/rcan-spec#g' \
  .github/workflows/release-notify.yml .github/actions/emit-version-tuple/README.md
```

- [ ] **Step 3: Verify zero refs remain + YAML still parses**
```bash
git grep -nI 'continuonai/rcan' -- .github/workflows/release-notify.yml .github/actions/emit-version-tuple/README.md || echo "CLEAN"
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release-notify.yml')); print('YAML OK')"
```
Expected: `CLEAN` then `YAML OK`.

- [ ] **Step 4: Commit**
```bash
git add .github/workflows/release-notify.yml .github/actions/emit-version-tuple/README.md
git commit -m "chore(ci): point release-notify + action docs at RobotRegistryFoundation"
```

- [ ] **Step 5: [OPERATOR] Push + PR** `gh pr create --fill --base master` (after operator go-ahead).

### Task 2.2: [AGENT] rcan-py CI refs

**Files:** Modify `~/rcan-py/.github/workflows/publish.yml`

- [ ] **Step 1: Branch** `cd ~/rcan-py && git checkout -b chore/rrf-org-ci-refs main`

- [ ] **Step 2: Apply substitution (workflow only)**
```bash
sed -i 's#continuonai/rcan-py#RobotRegistryFoundation/rcan-py#g; s#continuonai/rcan-spec#RobotRegistryFoundation/rcan-spec#g' \
  .github/workflows/publish.yml
```
This fixes the four `--repo continuonai/rcan-py` lines and the two `uses: continuonai/rcan-spec/.github/actions/emit-version-tuple@v3.2.3` lines.

- [ ] **Step 3: Verify + parse**
```bash
git grep -nI 'continuonai/rcan' -- .github/workflows/publish.yml || echo "CLEAN"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish.yml')); print('YAML OK')"
```
Expected: `CLEAN` then `YAML OK`.

- [ ] **Step 4: Commit**
```bash
git add .github/workflows/publish.yml
git commit -m "chore(ci): point publish workflow at RobotRegistryFoundation"
```

- [ ] **Step 5: [OPERATOR] Push + PR** (`--base main`, after go-ahead).

### Task 2.3: [AGENT] rcan-ts CI refs

**Files:** Modify `~/rcan-ts/.github/workflows/publish.yml`

- [ ] **Step 1: Branch** `cd ~/rcan-ts && git checkout -b chore/rrf-org-ci-refs master`

- [ ] **Step 2: Apply substitution + fix the OIDC comment**
```bash
sed -i 's#continuonai/rcan-spec#RobotRegistryFoundation/rcan-spec#g; s#org continuonai, repo rcan-ts#org RobotRegistryFoundation, repo rcan-ts#g' \
  .github/workflows/publish.yml
```

- [ ] **Step 3: Verify + parse**
```bash
git grep -nI 'continuonai' -- .github/workflows/publish.yml || echo "CLEAN"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish.yml')); print('YAML OK')"
```
Expected: `CLEAN` then `YAML OK`.

- [ ] **Step 4: Commit**
```bash
git add .github/workflows/publish.yml
git commit -m "chore(ci): point publish workflow + OIDC note at RobotRegistryFoundation"
```

- [ ] **Step 5: [OPERATOR] Push + PR** (`--base master`, after go-ahead).

### Task 2.4: [AGENT] Sweep the 5 consumer repos

**Files:** Modify the `release.yml` in each of: OpenCastor, robot-md, robot-md-gateway, robot-md-mcp, RobotRegistryFoundation.

Each consumer references only `uses: continuonai/rcan-spec/.github/actions/emit-version-tuple@v3.2.3`; the substitution is identical.

- [ ] **Step 1: For each repo — branch, substitute, verify, commit**
```bash
for r in OpenCastor robot-md robot-md-gateway robot-md-mcp RobotRegistryFoundation; do
  cd ~/$r || continue
  base=$(git symbolic-ref --short HEAD)               # current default checkout
  git checkout -b chore/rrf-org-ci-refs
  sed -i 's#continuonai/rcan-spec#RobotRegistryFoundation/rcan-spec#g' .github/workflows/release.yml
  echo "== $r =="
  git grep -nI 'continuonai/rcan-spec' -- .github/workflows/release.yml || echo "  CLEAN"
  python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('  YAML OK')"
  git add .github/workflows/release.yml
  git commit -m "chore(ci): point rcan-spec action ref at RobotRegistryFoundation"
done
```
Expected: each repo prints `CLEAN` then `YAML OK`, then commits.

- [ ] **Step 2: Confirm all 5 branches committed**
```bash
for r in OpenCastor robot-md robot-md-gateway robot-md-mcp RobotRegistryFoundation; do
  echo "$r: $(git -C ~/$r log --oneline -1)"
done
```
Expected: each shows the new `chore(ci): point rcan-spec action ref…` commit.

- [ ] **Step 3: [OPERATOR] Push + PR each** (after go-ahead):
```bash
for r in OpenCastor robot-md robot-md-gateway robot-md-mcp RobotRegistryFoundation; do
  git -C ~/$r push -u origin chore/rrf-org-ci-refs && gh pr create --repo $(git -C ~/$r remote get-url origin | sed -E 's#.*github.com[:/](.+)\.git#\1#') --fill --head chore/rrf-org-ci-refs
done
```

---

## Phase 3 — Publishing trust under the new owner

### Task 3.1: [OPERATOR] Register PyPI trusted publisher

- [ ] **Step 1:** Log into PyPI **from the account that owns `rcan`** (resolve the cmmerry@ucdavis vs craigm26@gmail ambiguity first — open Your Projects and confirm `rcan` is manageable).
- [ ] **Step 2:** `rcan` → Manage → Publishing → GitHub Actions → Add:
  - Owner: `RobotRegistryFoundation`
  - Repository: `rcan-py`
  - Workflow filename: `publish.yml`
  - Environment: `pypi`
- [ ] **Step 3: Verify** a "trusted publisher" row now lists `RobotRegistryFoundation/rcan-py @ publish.yml (pypi)`.

### Task 3.2: [OPERATOR] Register npm trusted publisher

- [ ] **Step 1:** npmjs.com → `rcan-ts` package → Settings → Trusted Publisher → GitHub Actions:
  - Organization or user: `RobotRegistryFoundation`
  - Repository: `rcan-ts`
  - Workflow filename: `publish.yml`
  - Environment: **leave blank** (npm-publish job sets no `environment:`)
- [ ] **Step 2: Verify** the package's Trusted Publisher shows `RobotRegistryFoundation/rcan-ts @ publish.yml`.

### Task 3.3: [OPERATOR] Verify release-signing secrets + environment survived transfer

- [ ] **Step 1: Compare against the Phase 0 snapshot**
```bash
gh secret list --repo RobotRegistryFoundation/rcan-py
gh secret list --repo RobotRegistryFoundation/rcan-ts
gh api repos/RobotRegistryFoundation/rcan-py/environments --jq '.environments[].name'
```
Expected: `RCAN_PY_RELEASE_*` / `RCAN_TS_RELEASE_*` present; `pypi` environment present.
- [ ] **Step 2:** Re-create any secret/environment that did not transfer (env secrets are not documented as transferred). Use the operator's key custody for `RCAN_*_RELEASE_*` values.

---

## Phase 4 — Metadata + governance polish

### Task 4.1: [AGENT] rcan-py metadata + docs

**Files:** Modify `~/rcan-py/pyproject.toml`, `README.md`, `SECURITY.md` (if present), `CLAUDE.md`, `docs/ci-integration.md`. (Continue on branch `chore/rrf-org-ci-refs` or a `docs/rrf-org-metadata` branch.)

- [ ] **Step 1: Substitute owner in metadata/docs (NOT CHANGELOG)**
```bash
cd ~/rcan-py
for f in pyproject.toml README.md CLAUDE.md docs/ci-integration.md; do
  [ -f "$f" ] && sed -i 's#continuonai/rcan-py#RobotRegistryFoundation/rcan-py#g; s#continuonai/rcan-spec#RobotRegistryFoundation/rcan-spec#g; s#continuonai/rcan-ts#RobotRegistryFoundation/rcan-ts#g' "$f"
done
```
- [ ] **Step 2: Verify**
```bash
git grep -nI 'continuonai/rcan' -- pyproject.toml README.md CLAUDE.md docs/ci-integration.md || echo "CLEAN"
grep -n 'Repository' pyproject.toml
```
Expected: `CLEAN`; Repository now `https://github.com/RobotRegistryFoundation/rcan-py`.
- [ ] **Step 3: Commit** `git commit -am "docs: point rcan-py metadata + docs at RobotRegistryFoundation"`

### Task 4.2: [AGENT] rcan-ts metadata + docs

**Files:** Modify `~/rcan-ts/package.json`, `src/index.ts`, `README.md`, `CLAUDE.md`.

- [ ] **Step 1: Substitute (NOT CHANGELOG)**
```bash
cd ~/rcan-ts
for f in package.json src/index.ts README.md CLAUDE.md; do
  [ -f "$f" ] && sed -i 's#continuonai/rcan-ts#RobotRegistryFoundation/rcan-ts#g; s#continuonai/rcan-py#RobotRegistryFoundation/rcan-py#g; s#continuonai/rcan-spec#RobotRegistryFoundation/rcan-spec#g' "$f"
done
```
- [ ] **Step 2: Verify package.json still parses + refs clean**
```bash
node -e "require('./package.json'); console.log('package.json OK')"
git grep -nI 'continuonai/rcan' -- package.json src/index.ts README.md CLAUDE.md || echo "CLEAN"
```
Expected: `package.json OK` then `CLEAN`. (CLAUDE.md line "NOT `@continuonai/rcan`, which 404s" is historical context — acceptable to leave; if changed, ensure it still reads sensibly.)
- [ ] **Step 3: Commit** `git commit -am "docs: point rcan-ts metadata + docs at RobotRegistryFoundation"`

### Task 4.3: [AGENT] rcan-spec docs

**Files:** Modify `~/rcan-spec/README.md`, `SECURITY.md`, `CLAUDE.md`, `docs/governance/robot-registry-foundation.md`.

- [ ] **Step 1: Substitute (NOT CHANGELOG; leave whitepaper/compliance historical docs unless desired)**
```bash
cd ~/rcan-spec
for f in README.md SECURITY.md CLAUDE.md docs/governance/robot-registry-foundation.md; do
  [ -f "$f" ] && sed -i 's#continuonai/rcan-spec#RobotRegistryFoundation/rcan-spec#g; s#continuonai/rcan-py#RobotRegistryFoundation/rcan-py#g; s#continuonai/rcan-ts#RobotRegistryFoundation/rcan-ts#g' "$f"
done
```
- [ ] **Step 2: Verify**
```bash
git grep -nI 'continuonai/rcan' -- README.md SECURITY.md CLAUDE.md docs/governance/robot-registry-foundation.md || echo "CLEAN"
```
Expected: `CLEAN`. (Governance doc line 140 now reads "hosted at github.com/RobotRegistryFoundation/rcan-spec".)
- [ ] **Step 3: Commit** `git commit -am "docs: point rcan-spec metadata + governance at RobotRegistryFoundation"`

### Task 4.4: [AGENT] Governance polish (CODEOWNERS + CONTRIBUTING pointer + stewardship note)

**Files:** Create `CODEOWNERS` + add a stewardship line to `README.md` in each of rcan-spec, rcan-py, rcan-ts; ensure a `CONTRIBUTING.md` pointer exists.

- [ ] **Step 1: Add CODEOWNERS + stewardship note per repo**
```bash
for r in rcan-spec rcan-py rcan-ts; do
  cd ~/$r
  printf '* @RobotRegistryFoundation/maintainers\n' > CODEOWNERS
  # Stewardship note appended after the first heading block if not already present:
  grep -q 'Stewarded by the Robot Registry Foundation' README.md || \
    printf '\n> Stewarded by the [Robot Registry Foundation](https://github.com/RobotRegistryFoundation). RCAN is an open standard; contributions welcome.\n' >> README.md
  [ -f CONTRIBUTING.md ] || printf '# Contributing\n\nRCAN is stewarded by the Robot Registry Foundation. Open issues and PRs here; normative spec changes go through the process in `rcan-spec`.\n' > CONTRIBUTING.md
done
```
- [ ] **Step 2: Verify**
```bash
for r in rcan-spec rcan-py rcan-ts; do echo "== $r =="; ls ~/$r/CODEOWNERS ~/$r/CONTRIBUTING.md; grep -c 'Stewarded by the Robot Registry Foundation' ~/$r/README.md; done
```
Expected: files exist; grep count `1` each.
- [ ] **Step 3: Commit each** `git -C ~/$r commit -am "docs: add CODEOWNERS + foundation stewardship note"` (per repo).

- [ ] **Step 4: [OPERATOR] Push + PR** the Phase-4 commits on each trio repo's branch (after go-ahead).

> Consumer-repo README/badge links (Category B, redirect-covered) are intentionally **out of scope** here — opportunistic only.

---

## Phase 5 — Verify (exit gate)

### Task 5.1: [AGENT] Grep gate — zero CI refs remain

- [ ] **Step 1: Assert no `continuonai/rcan` in tracked CI/metadata across all 8 repos**
```bash
fail=0
for r in rcan-spec rcan-py rcan-ts OpenCastor robot-md robot-md-gateway robot-md-mcp RobotRegistryFoundation; do
  hits=$(git -C ~/$r grep -nI 'continuonai/rcan' -- '.github/**' 'pyproject.toml' 'package.json' 'src/index.ts' 'docs/ci-integration.md' 2>/dev/null)
  if [ -n "$hits" ]; then echo "FAIL $r:"; echo "$hits"; fail=1; fi
done
[ "$fail" = 0 ] && echo "EXIT GATE PASS: zero CI/metadata refs to continuonai/rcan"
```
Expected: `EXIT GATE PASS`. (These run against the migration branches; the gate is meaningful once Phase 2/4 PRs are merged — re-run on the merged default branches.)

### Task 5.2: [OPERATOR] Dry-run release confirms OIDC + action resolution

- [ ] **Step 1:** After the Phase-2 PRs merge, dispatch a no-publish dry run to confirm the `emit-version-tuple` action resolves from the new owner and OIDC auth is wired:
  - npm: Actions → `Release` → Run workflow with `publish_npm=false` on `rcan-ts` → confirm `build-and-test` + (if tagged) `emit-version-tuple` steps resolve with no "action not found" error.
  - PyPI: tag a patch release (or use the existing `workflow_dispatch` backfill path) → confirm the `publish` job authenticates via OIDC (no `PYPI_TOKEN` used) and `emit-version-tuple` runs.
- [ ] **Step 2: Verify** the published artifact (if a real release) appears on PyPI/npm and the Actions log shows OIDC token exchange (not token auth).

### Task 5.3: [OPERATOR] Unfreeze

- [ ] **Step 1:** Lift the release freeze announced in Task 0.2. Migration complete.

---

## Out of scope (separate follow-ups)
- **Token retirement:** delete `PYPI_TOKEN` / `NPM_TOKEN` repo secrets + revoke the tokens — only after Task 5.2 proves OIDC works under the new owner. Tracked separately per operator decision.
- Package renames / npm scoping.
- Consumer-repo Category-B doc/badge link updates.
- `rcan://…/continuonai/…` manufacturer-namespace URIs and historical CHANGELOG entries (intentionally preserved).
