# Bounded Embodiment alignment audit: rcan-spec

**Date:** 2026-09-29
**Branch:** `align/bounded-embodiment`
**Scope:** this repository (`RobotRegistryFoundation/rcan-spec`) and, because the
normative section prose no longer lives here, the repository that now publishes it
(`craigm26/rcan-docs`, served at docs.rcan.dev). Everything below was read, not
assumed. Line numbers are as of the commit this branch is based on.

This is an audit, not a fix list. Findings marked **open question** are for the
maintainer to decide; this branch does not silently change them.

---

## 0. Structural finding: the spec text is in another repository

Commit `6d56881` (2026-05-03, "redirect RCAN spec prose to docs.rcan.dev") removed the
34 section pages from this repo. `public/_redirects` now sends `/spec/section-N` and
`/spec/` to `https://docs.rcan.dev/spec/…`, whose source is `craigm26/rcan-docs`
(`docs/spec/section-1.md` … `section-27.md`, `appendix-b.md`, plus `authority.md`,
`competitions.md`, `credits.md`, `firmware.md`, `sbom.md`).

Consequences for this alignment:

- The section references below (§6, §8, §16, …) point into `rcan-docs`.
- A new appendix written in this repo is not rendered on docs.rcan.dev until it is
  mirrored there. This branch puts the canonical text at
  `spec/appendix-c-physical-assurance.md` (the repo already keeps normative markdown
  under `spec/`, e.g. `spec/audit-bundle-v1.md`) and lists the mirror as follow-up.
- `CLAUDE.md` (the committed version) still describes `src/pages/spec/index.astro`
  and `section-N.astro` pages that no longer exist.

---

## 1. Where R1–R5 are already covered

| Req | Existing coverage | Where | Strength |
|---|---|---|---|
| **R1** Declared envelope | `physics` block (kinematic type, DoF, dimensions); `hardware_safety` declaration (physical E-stop, watchdog MCU, F/T sensors, proximity sensing, SIL/PL); `safety.local_safety_wins`; §23 benchmark thresholds (`safety.benchmark_thresholds.*`) | rcan-docs §8.2–§8.5; `public/schemas/rcan-config.json` (`hardware_safety`, `watchdog`, `safety`); rcan-docs §23 | **Partial.** Nothing declares workspace bounds, max speed/turn/accel, force limits, stopping time or stopping distance in a machine-readable, signable form. `bounds_check` exists in §23 as a benchmarked path, but the bounds themselves are not a published schema. |
| **R2** Enforcement below the model | §6.2 Invariant 1 "Local safety always wins"; Invariant 7 (prompt-injection scan before the model); §6.3 enforcement order (token → role → rate limit → injection scan → confidence gate → HiTL gate → audit write → dispatch), "enforced in the RCAN runtime layer, before payloads reach application code"; §12 obstacle e-stop "enforced independently of LLM output"; §2.7.1 non-escalation invariant | rcan-docs §6.2, §6.3, §12, §2.7.1 | **Partial.** The ordering puts gates between the model and dispatch, but nothing requires that the model have **no write path** to the gate, the limits or the log, and nothing requires the gate to run in a separate process or on separate compute. §6.1 explicitly puts "hardware safety systems (emergency stops, physical limits)" out of scope. |
| **R3** Stop always wins | §6.2 Invariant 2 (network loss → safe-stop within one `latency_budget_ms`); Invariant 6 (`Priority.SAFETY` skips queues); §6.3 heartbeat SHOULD with timeout `latency_budget_ms × 2`; §2 "ESTOP from any principal is ALWAYS honored" (§2.5, §2.8.3, §2.9.4); §3.4 SAFETY priority; §15 "E-stop is always local"; `watchdog` config block; SAFETY message (`schemas/messages/safety.json`, STOP/ESTOP/RESUME); §23 `estop` path (P95 ≤ 100 ms default) | rcan-docs §2, §3.4, §6, §15, §23; `schemas/messages/safety.json`; `public/schemas/rcan-config.json#/properties/watchdog`; Appendix B.3 (WebSocket heartbeat) | **Partial.** Stop *latency* of the software path is benchmarked, but stop *time and distance at maximum speed, per stop source* are not declared or measured. No requirement covers loss of power. The §23 `estop` path is measured synthetically ("calling Python code paths directly"), which is a software-path timing, not a machine stop measurement. |
| **R4** Accountable commands | §6.2 Invariant 3 (every COMMAND/CONFIG logged with principal identity); §2 role hierarchy, scopes, M2M roles, multi-hop scope propagation; §5 JWT verification order; §16.4 HiTL `AUTHORIZE` from OWNER+ with both messages in the audit chain; §21.3 ownership proof; §1.6 signed RURI | rcan-docs §1.6, §2, §5, §6.2, §16.4, §21.3; rcan.dev `/docs/delegation` | **Good**, within the limits the framing sets (identity and delegation mechanics are FG-TIDA territory, not this work). |
| **R5** Tamper-evident evidence | §6.2 Invariant 3 (audit trail); §16.2 model identity in audit records; §16.6 watermark tokens with a public verify endpoint; conformance suite L2 "Audit chain integrity … chained via HMAC-SHA256" and L3 "offline chain verification"; `spec/audit-bundle-v1.md` (signed bundles); `schemas/commitment.json` | rcan-docs §6, §16; `scripts/conformance/README.md`; `spec/audit-bundle-v1.md` | **Partial.** The chain requirement lives in the *conformance suite README*, not in §6 or §16 prose. The audit record's `outcome` is `ok`/`blocked`/`error`, which cannot express `clamp` (command modified before execution) or record what was actually applied, the envelope in force, or a digest of the state the decision was made on. |

---

## 2. Gaps

### Requirements
- **R1:** no envelope schema (workspace keep-in/keep-out, speed, turn rate,
  acceleration, force, proximity rules, max state age, stop category/time/distance,
  heartbeat timeouts, authority requirement, integrator signature).
- **R2:** no "model has no write path to gate, envelope or log" requirement; no
  gate-placement requirement (separate process / independent compute).
- **R3:** no per-stop-source stop time/distance declaration; no loss-of-power
  requirement; no distinction in the spec text between the RCAN ESTOP *message* and a
  hardwired power cut (see §5 below: two schema descriptions blur them).
- **R5:** hash-chaining is required only in the conformance README; no replay-against-
  envelope procedure.

### Decisions
- The four gate decisions `allow`, `clamp`, `reject`, `stop` do not exist as a vocabulary.
  The nearest are `outcome: ok | blocked | error` (§6) and `on_fail: block | escalate | allow` (§16.3).
- Fail-closed-to-`stop` on exception, timeout, stale state or unparseable command is
  not stated. §16.3 treats *missing confidence* as a gate miss, which is the only
  existing fail-closed rule.

### Schema fields
- No `envelope` block in `rcan-config.json`.
- No `gate_decision` audit record (`seq, t, principal, authority, cmd, decision,
  applied, reason, envelope, state_digest, prev, hash`).

### Tests
- No tests for EV-01 … EV-09. The §23 benchmark covers timing of four software paths
  only. The conformance JSON has `L2-SAFE-*` cases (estop_active rejects COMMAND,
  audit chain tamper) that are close to EV-07/EV-08 in spirit.

### Assurance levels
- There is no physical-assurance axis. `hardware_safety.sil_level` exists as a
  self-declared field, with no statement that it is self-declared.

---

## 3. Naming inconsistencies: expansions of "RCAN" (open question)

Four different expansions are in use. This branch does not pick one.

| Expansion | Occurrences |
|---|---|
| **Robot Communication and Autonomy Network** | `CLAUDE.md:3` (this repo); rcan-docs `docs/spec/index.md:5` (the published spec landing page) |
| **Robot Communication and Addressing Network** | `docs/compliance/eu-ai-act-mapping.md:19`; `docs/compliance/iso-10218-alignment.md:15`; `docs/compliance/nist-ai-rmf-alignment.md:19`; `docs/whitepaper/ai-accountability-layer-2026.md:14`, `:90`; same five lines duplicated in rcan-docs `docs/compliance/*` and `docs/whitepaper/*` |
| **Robot Communication & Addressing Network** | `package.json:5`; `src/layouts/BaseLayout.astro:13` (site-wide default meta description); `src/pages/docs/introduction.astro:7`; `src/pages/index.astro:34` |
| **Robot Common Address Notation** | `schemas/registry-api.openapi.yaml:7`; `public/schemas/registry-api.openapi.yaml:7` |

The AAIF Sandbox proposal ([aaif/project-proposals#43](https://github.com/aaif/project-proposals/issues/43))
uses "Robot Communication and Addressing Network".

"Robot Communication and Networking Protocol" does not occur in this repo or in
rcan-docs. It may be in the RRF site repo; that repo's audit will say.

---

## 4. Section-number drift (open question)

Canonical section list (rcan-docs `docs/spec/index.md`): §1–§27, Appendix B, plus
Authority, Competitions, Credits, Firmware, SBOM pages.

### 4.1 This repo lists fewer sections than exist
- `README.md` "Spec Sections" table lists §1–§21 and then "Appendix B | Conformance
  Levels L1–L4". §22–§27 exist and Appendix B is the **WebSocket Transport Binding**,
  not conformance levels.
- `src/pages/governance.astro:147` "Full §1–§21 conformance is required."

### 4.2 References that do not resolve or resolve to the wrong thing
| Location | Reference | Problem |
|---|---|---|
| `src/pages/docs/mcp.astro:107–183` | §22.1–§22.9 (MCP server) | §22 is Fundamental Rights Impact Assessment. |
| `src/pages/docs/training-consent-api.astro:94–151` | §23.1–§23.6 (training consent) | §23 is Safety Benchmark Protocol. |
| `src/pages/docs/messages.astro:260`, `:413`; `public/compatibility.json:26` | §8.8 observer mode | §8 ends at §8.7 (voice, proposed). |
| `src/pages/docs/delegation.astro:98`; `public/compatibility.json:26` | §8.9 physical presence | No §8.9. |
| `public/compatibility.json:26` | §8.3 replay prevention, §8.4 time sync, §8.5 cloud relay, §8.6 key rotation, §5.3 QoS, §9.2 CONFIG_UPDATE, §11.2 consent | §8.3 is Reference Example, §8.6 is Multi-Runtime Agent; §5.3 is Gateway JWT; §9 and §11 have no such subsections. These are v1.5-era numbers. |
| `scripts/conformance/README.md` | "§14–§15" for safety; §16.1 model identity; §16.2 confidence gates; §16.3 HiTL; §16.4 thought log | §14/§15 are Provider Management / Swarm. In rcan-docs, model identity is §16.2, confidence gates §16.3, HiTL §16.4, thought log §16.5. |
| rcan-docs `docs/spec/section-6.md` §6.3 | "Confidence gate (§16.2)", "HiTL gate (§16.3)" | Same off-by-one inside the spec itself. |
| `scripts/conformance/check_l1.py:31` | "RURI validation (§3 of the RCAN spec)" | RURI is §1. |
| `README.md:25` | "EU AI Act §23–§27 compliance blocks" | `src/pages/about.astro:128` says "§23–§26 added" in v3.0; rcan-docs §8.7 says "§22-26 compliance artifact"; §22 and §27 are **both** titled FRIA. |
| `spec/decisions/2026-05-04-profile-freeze.md` Decision 2 | enum lives in `src/pages/spec/section-5.astro` | File was deleted in `6d56881`; §5 is Authentication. |
| `spec/decisions/2026-05-04-profile-freeze.md` Decision 5 | "Spec §6 lists 18 Protocol-66 invariants" | Published §6 lists seven. |

### 4.3 Numbering drift in message types (adjacent, found while checking R3)
| Source | HEARTBEAT | CONFIG | SAFETY | AUTH |
|---|---|---|---|---|
| rcan-docs §3.2 canonical table ("SINGLE SOURCE OF TRUTH") | 4 | 5 | 6 | 7 |
| `schemas/messages/heartbeat.json` + `schemas/README.md` | **5** | **2** | 6 | **4** |
| rcan-docs `docs/spec/authority.md:134` | – | – | "ESTOP (type **7**)" | – |

### 4.4 Version drift
`public/sdk-status.json` `spec_version: "3.0"`; `package.json` `3.0.0`; rcan-docs
index "Version 3.2"; profile-freeze decision `3.2.0`; `VERSIONING.md` "Current version:
**v1.3**"; `scripts/conformance/README.md` "Version: 1.2" and a spec link to
`rcan.continuon.cloud`.

### 4.5 Conformance level definitions disagree
| Source | L2 | L3 | L4 |
|---|---|---|---|
| `CLAUDE.md` glossary | Secure: HiTL, Ed25519, AuditChain | Federated | Registry |
| `README.md` "Conformance Badges" | authentication, RBAC, ESTOP | replay prevention, audit chain, confidence gates | registry, RRN, ownership proof |
| `scripts/conformance/README.md` | "Safety" | "AI Accountability" | (not defined) |
| rcan-docs `governance/robot-registry-foundation.md:205` | – | – | "**L4 — Safety**" |

Appendix C does not depend on which definition wins: it only states that A-levels are
independent of whichever L-levels RCAN settles on.

### 4.6 Appendix letters
Appendix B is the only appendix in the published spec. `CHANGELOG.md:283` mentions an
"Appendix F" in an old release. No Appendix A, C, D or E exists in the spec. This
branch uses **Appendix C**.

---

## 5. Public claims that conflict with the honesty rules

None of these are changed by this branch (the rcan-spec task list does not cover
them). Each is listed for the maintainer. The first three are the most serious.

1. **Legal structure and revenue claims.** `src/pages/governance.astro:101–128`:
   "OpenCastor Inc. (a California Benefit Corporation) is a founding sponsor of both
   foundations", plus a "Revenue commitment" block of 5% + 5% = "10% total committed".
   `:36–52` and `:77–85` describe two "planned 501(c)(3)" non-profits with a
   "7-seat board of directors". None of this is sourced in the repo.
2. **Certification program.** `src/pages/governance.astro:137–168` describes an
   "RCAN-Certified program", "Certification badge … for use in datasheets, packaging, and
   marketing materials", and "Until Q3 2026, OpenCastor runs a pre-certification
   self-assessment program". This contradicts the README's "Conformance is not
   certification … intentionally out-of-scope for the foundation in 2026", and Q3 2026
   ends tomorrow. `src/pages/api/index.astro:334` defines a `certified` tier as
   "Passed third-party conformance test suite"; no third-party suite exists.
3. **Standards engagement.** `src/pages/about.astro:108`: "Standards engagement is
   underway with ISO/TC 299 WG3 (industrial robot safety) and EU harmonized standards
   bodies". Nothing in the repo substantiates engagement. `docs/engagement/` contains a
   roadmap, not correspondence.
4. **Formation dates and board recruitment.** `src/pages/governance.astro`: "Formation
   target: Q3 2026" (`:36`) and "Board seat recruitment is active" (`:52`). The
   governance page links to the `continuonai` GitHub org (`:181`) rather than
   `RobotRegistryFoundation`.
5. **Endorsement language.** `docs/governance/robot-registry-foundation.md:4`
   "Seeking co-founders, endorsing organizations"; `:294`, `:309` (endorsement statement
   on issue #13).
6. **Maintainer count.** `src/pages/about.astro:94` says RCAN "is designed and
   maintained by Craig Merry" but nowhere states that there is **one maintainer and no
   third-party verification**. Nothing states the AAIF status.
7. **Two stops conflated.** `schemas/messages/safety.json` describes the ESTOP *message*
   as "ESTOP cuts motion actuators immediately" / "immediate actuator cut", and
   `schemas/README.md` repeats "Immediate actuator cut — no deceleration ramp". A
   message cannot guarantee an actuator cut when software is the failure. The
   hardwired path is described separately and correctly by
   `hardware_safety.physical_estop` ("cuts actuator power independently of software").
8. **Unsourced numbers.** `README.md` SDK test counts (754 / 447 / 6,459) and
   `src/pages/about.astro:122` "P66 conformance 87%→94%" have no source in this repo.
9. **Unverified mechanism names.** rcan-docs `compliance/eu-ai-act-mapping.md`,
   `compliance/nist-ai-rmf-alignment.md` and `whitepaper/ai-accountability-layer-2026.md`
   describe the audit chain as "QuantumLink-Sim … BB84 quantum key distribution
   simulation" and give it "Full" Art. 12 coverage. The chain property that matters is a
   hash/HMAC chain; the QKD framing invites a reviewer to discount the whole document.
10. **ITU / AAIF.** No occurrence of ITU, FG-EAI, AAIF or Linux Foundation endorsement
    anywhere in this repo or rcan-docs. Nothing to correct; the new appendix adds the
    approved wording only.

---

## 6. What this branch changes in response

See the PR description. In short: Appendix C (informative, except where it restates
existing MUSTs), `schemas/envelope.json`, `schemas/gate-decision.json`, fixtures, an
optional `envelope` block in `rcan-config.json`, `tests/assurance/`, EV test cases for
the conformance runner, README and changelog. The one existing sentence reworded is the
README's Protocol 66 entry, which now leads with the plain description. Everything in §3–§5 of this audit is left
for the maintainer.

---

## 7. Resolutions (consistency pass, same branch)

After the audit, the maintainer asked for the findings to be fixed across the ecosystem.
The decisions taken, and why:

| Finding | Decision | Basis |
|---|---|---|
| Four RCAN expansions | **Robot Communication and Addressing Network** everywhere | The original name (first public proposal, 2026-01-02 blog post), the AAIF proposal, rcan-py, robot-md, the compliance docs and site metadata already use it |
| Message-type numbers | Schemas follow **§3.2**: HEARTBEAT 4, CONFIG 5, AUTH 7, INVOKE_CANCEL 13 | §3.2 calls itself the single source of truth and both rcan-py and rcan-ts implement it; only the JSON schemas disagreed |
| AUTHORIZE message number | **45**, appended to §3.2 (maintainer approved, 2026-09-29) | No entry in §3.2 or either SDK; the schema's 9 is DISCOVER in §3.2 and came from OpenCastor's pre-v2.1 enum. 45 is the next free number, so the change is additive |
| L1–L4 definitions | **L1 Core, L2 Safety, L3 AI Accountability, L4 Registry Integration** | Matches the published suite (rcan.dev/conformance), the conformance case files and §21.6 |
| §27 | **Reserved: Spatial Intelligence Eval** (rcan-docs) | §27 duplicated §22's `rcan-fria-v1` with a wrong article citation; the registry already uses §27 for spatial eval |
| Governance, certification, standards claims | Rewritten to what is true (one maintainer, no board, no certification program, AAIF proposed not accepted, seeking review) | Honesty rules; no source for the B-Corp, revenue, 501(c)(3), certification or ISO engagement claims |
| rcan.dev registry tier descriptions | Describe what the code does (owner-requested with evidence URL; `accredited` auto-approved); values unchanged | Renaming tier values would break the wire format |
| QuantumLink-Sim framing | Tamper evidence attributed to the SHA-256 `prev_hash` chain (OpenCastor `castor/audit.py`); QuantumLink-Sim described as an optional simulation that adds no quantum security | Read the OpenCastor source; the IEC 62443 SL 4 row claimed quantum-adversary forward secrecy from a simulation |
| Section-number drift in pages | Page-local numbering no longer uses § (MCP, training consent); §8.8/§8.9 labels removed; §16 off-by-one fixed | Those pages are not spec sections |
| Stale org links | `continuonai/*` → `RobotRegistryFoundation/*`; `blob/main` → `blob/master`; conformance link to nonexistent `v1.10.json` → `v1.4.json` | Repos were transferred |

Still open: OpenCastor's runtime enum (`castor/rcan/message.py`) uses a pre-v2.1 numbering throughout (DISCOVER 1, STATUS 2, COMMAND 3, AUTHORIZE 9), so it does not interoperate with §3.2 on the wire; `public/sdk-status.json` `spec_version` (written by CI from outside this repo); `CLAUDE.md` (the maintainer has uncommitted edits to it); the `/governance` route collision (`src/pages/governance/index.astro` redirect stub vs `governance.astro`; Astro serves the latter; removing the stub means deleting a file); the historical v1.5 entry in `public/compatibility.json`; dated blog posts on craigmerry.com and opencastor.com that use "Autonomy Network" or describe a Benefit Corporation.

Note added 2026-10-08: the physical assurance levels A1–A3 referred to in this audit were renamed BE-1, BE-2, BE-3 (Bounded Embodiment), because "A3" is the Association for Advancing Automation, which publishes ANSI/A3 R15.06 and runs the US delegation to ISO/TC 299.
