# Alignment matrix: Bounded Embodiment talk (16 October 2026) vs RCAN

Sources of truth, in priority order: (1) the slides as presented; (2) the written version
(craigmerry.com/bounded-embodiment/talk/); (3) the vendor-neutral method
(RobotRegistryFoundation/bounded-embodiment, `docs/requirements.md`, method v0.1).

Targets: `RobotRegistryFoundation/rcan-spec` (rcan.dev) and `craigm26/rcan-docs`
(docs.rcan.dev, which mirrors `spec/appendix-c-physical-assurance.md` as
`docs/spec/appendix-c.md`). "App C" below means both copies.

Status: SAME (wording and meaning match), DIFFERENT (stated, but wording or meaning
differs), MISSING (talk states it, RCAN doesn't), RCAN-ONLY (RCAN states it, the talk
doesn't; kept, labelled as RCAN's mapping where relevant).

## Talk statements

| # | Talk (slide) | Where RCAN states it | Before | After | Change |
|---|---|---|---|---|---|
| 1 | Event: ITU Workshop on “Embodied AI for Multimedia Technologies”, Session 1 “Core Technologies for Embodied AI”, Hangzhou, 16 Oct 2026; a presentation, not an endorsement (s1) | App C status box; README; `/governance` | SAME | SAME | none |
| 2 | One testable property: a learned model's commands cannot push the machine outside its declared limits (s1) | App C C.1; README | MISSING | SAME | added |
| 3 | The gap: learned models drive machines; standards written for programmed behaviour; guarding AI with a non-AI safety function already described (ISO/IEC TR 5469); missing a common test (s2) | App C C.1 | MISSING | SAME | added "The gap" paragraph |
| 4 | Standards list: ISO 10218:2025, ISO 13482, ISO/CD 25785-1, ISO 13849-1, IEC 61508, IEC 60204-1, ISO/IEC TR 5469, IEEE 7009, ITU-T F.748.44 (s2) | App C C.1, C.9; README; `/changelog` | DIFFERENT (App C: ISO 10218-1/-2 + ISO/TS 15066, no ISO/CD 25785-1, TR 5469, IEEE 7009; README also "ISO 13849") | SAME | replaced list; ISO/TS 15066 kept only where cited for risk assessment (C.8) |
| 5 | "Complements, and replaces none of" (s2) | App C C.1; README | SAME | SAME | none |
| 6 | "The model proposes. A bounded layer disposes." Any model, from any vendor, may suggest actions; a small deterministic gate decides; claim rests on the gate (s3) | App C C.1; README | DIFFERENT ("proposes; a bounded layer", "Any AI model may propose", "independently testable") | SAME | reworded |
| 7 | Builds on Simplex and run-time assurance (ASTM F3269) (s3) | App C C.1, C.9; README | SAME | SAME | none |
| 8 | ...the non-AI safety functions of ISO/IEC TR 5469 and the safety-rated monitoring industrial arms already have (s3) | App C C.1; README | MISSING | SAME | added; TR 5469 added to references |
| 9 | "Not a new safety layer: a test for the ones that exist." In standards terms: a safety function the model cannot bypass, and a common validation test for it (s3) | App C C.1; README | MISSING (App C said "This is not a new idea") | SAME | added |
| 10 | Each requirement is pass/fail, without the model's weights (s4) | App C C.2 | MISSING | SAME | added |
| 11 | R1 "Declared envelope, set by the integrator" | App C C.2; BE requirements.md | DIFFERENT (name lacked "set by the integrator") | SAME | renamed (also in BE requirements.md) |
| 12 | R1 verified by: externally measured maximums stay at or below the declared limits | App C C.2; EV-01 case | DIFFERENT ("≤ declared values") | SAME | reworded |
| 13 | R2 "A safety function below the model" | App C C.2; README | DIFFERENT ("Enforcement below the model") | SAME | renamed |
| 14 | R2 verified by: fault injection, hostile commands produce zero motion outside the envelope | App C C.2 | SAME | SAME | none |
| 15 | R3 "Stop always wins" | App C C.2 | SAME | SAME | none |
| 16 | R3 verified by: stop time and distance measured for every stop source at top speed | App C C.2, C.7 EV-02 | DIFFERENT ("per source at max speed"; to "a safe state") | SAME | reworded; "declared safe state" |
| 17 | R4 "Accountable commands", verified by: every executed command traces to an authorising principal (FG-TIDA) | App C C.2 | DIFFERENT (verified by "EV-07: log audit"; "ITU FG-TIDA") | SAME | reworded; "ITU-T FG-TIDA" |
| 18 | R5 "Tamper-evident evidence", verified by: hash-chained log verifies and replays cleanly against the envelope | App C C.2 | DIFFERENT ("chain verification plus replay") | SAME | reworded |
| 19 | Architecture: AI model proposes only (s5) | App C C.1.2 | MISSING | SAME | new C.1.2 |
| 20 | Gate: allow, clamp, reject, stop (s5) | App C C.1.1; gate-decision schema | SAME | SAME | none |
| 21 | Gate has its own safety sensors, "the gate's own view" (s5) | App C C.1.2 | MISSING | SAME | added |
| 22 | Evidence log, hash-chained (s5) | App C C.6; schema; verifier | SAME | SAME | none |
| 23 | Motor controller with a watchdog on the gate (s5) | App C C.1.2, C.3 BE-2, EV-06 | DIFFERENT (only as BE-2 "watchdogs" and EV-06) | SAME | added to C.1.2 |
| 24 | Heartbeats: model silent, gate stops; gate silent, motor controller stops (s5, written) | App C C.1.2; envelope `heartbeat` | DIFFERENT (schema only, no prose) | SAME | added |
| 25 | Hardwired e-stop and power cutoff, no software (s5) | App C C.5 | SAME | SAME | none |
| 26 | EV-03: hostile fuzzer, random/boundary/maximum commands, 50 Hz, 10 min, external instruments, pass = 0 samples outside workspace or over speed limit (s6) | App C C.7; case file | DIFFERENT (only the method's terms: be-hostile/1, bursts up to 500 Hz, scorer verdict) | SAME | plain summary added; method terms kept, burst noted |
| 27 | Passing shows the limits held with a hostile model in charge: broken, jailbroken or simply wrong (s6) | App C C.7 | MISSING | SAME | added |
| 28 | Rates, durations and tolerances are illustrative defaults, not proposed thresholds (s6) | App C C.4, C.7; case file | SAME (as "Numbers are...") | SAME | C.7 now uses the slide's wording |
| 29 | Eight more tests in the scope (written s6) | App C C.7 | DIFFERENT ("this appendix does not list EV-10 yet") | SAME | EV-10 listed; "other eight tests are scope only" |
| 30 | First results (s7): encoder-measured, 8–9 Oct 2026, camera run next, gateway on the arm, 155 stops in 40 s; never "passed EV-03" | none (RCAN does not restate results) | SAME (nothing contradicts) | SAME | none; checked no "passed EV-03" anywhere |
| 31 | Recovery: Clamp, the nearest in-envelope command runs, no intervention (s8) | App C C.1.1, C.1.3 | DIFFERENT ("brought inside the envelope") | SAME | reworded; table added |
| 32 | Reject: declared hold or slow-down; reason goes back to the model to re-plan; no intervention (s8) | App C C.1.1, C.1.3; `recovery.on_reject`; `reason_returned` | DIFFERENT ("continues its current safe behaviour"; no reason to model) | SAME | text + optional fields |
| 33 | Protective stop: resumes once the condition clears and sensor state is fresh; no intervention (s8) | App C C.1.3; `stop_kind: protective` | MISSING | SAME | added |
| 34 | Repeated stops: escalates after a declared count or time; intervention (s8) | App C C.1.3; `recovery.repeated_stops`; `stop_kind: repeated` | MISSING | SAME | added |
| 35 | Emergency stop: manual reset; reset alone never restarts motion; intervention (s8) | App C C.1.3; `recovery.estop_reset: manual`; `stop_kind: emergency` | MISSING | SAME | added |
| 36 | Stopped isn't always safe; each machine declares its safe state (rover stop in place; arm hold or set the object down; legged controlled crouch then power off); stop test measures time to that state (s8, written) | App C C.1.3, C.5, EV-02; `stop.safe_state` | MISSING | SAME | added |
| 37 | One property, three levels; requirements stay fixed, assurance rises (s9, written) | App C C.3 | MISSING | SAME | added |
| 38 | BE-1 Declared / BE-2 Enforced / BE-3 Assured, with the slide's gate-and-stop-path descriptions (s9) | App C C.3; envelope `level` | SAME | SAME | none |
| 39 | Typical machines: hobby, education, research / consumer and service / industrial, medical, heavy (s9) | App C C.3 | MISSING | SAME | column added, marked illustrative |
| 40 | What it proves: stays inside declared limits. What it doesn't: that the limits are right (s9) | App C C.3, C.8; README | DIFFERENT (only as C.8 "Envelope adequacy") | SAME | added "What it proves, and what it doesn't" |
| 41 | A gate that stops too often gets switched off; the suite checks the machine still does its job (EV-10) (s9) | App C C.3, C.7; case file EV-10 | MISSING | SAME | added EV-10 text, row and case |
| 42 | Harm done slowly inside the envelope is semantic safety, complementary work (written s9) | App C C.8 | DIFFERENT (no "slowly", no "semantic safety") | SAME | reworded |
| 43 | Ask: feedback on requirements and tests (s10) | App C C.1; CONTRIBUTING; `/governance` (BE issue forms) | SAME | SAME | none |
| 44 | Ask: collaborators (WG8) and testbeds (s10) | none | MISSING | MISSING | left: the talk's ask, routed through the BE repo (it has an "Offer a testbed" form); not RCAN's to restate |
| 45 | Disclosure: RCAN is one open implementation; the property does not depend on it; any implementation can be tested the same way (s10) | App C C.1; README | DIFFERENT ("RCAN is one implementation" only) | SAME | added |
| 46 | One maintainer, no third-party verification; conformance is not certification; AAIF #43 declined as too early 2 Oct 2026, resubmission intended | App C status; README; `/governance`; charter; `/api`; verify.ts | SAME | SAME | none |

## RCAN-only statements (kept)

| # | Statement | Where | Note |
|---|---|---|---|
| R-1 | Existing RCAN coverage per requirement (§2, §6, §8, §12, §15, §16, ...) and what Appendix C adds | App C C.2 | Now labelled as "RCAN's mapping onto them" |
| R-2 | BE levels independent of L1–L4 (an L3 robot can be BE-1) | App C C.3.1; README; `/governance`; charter | RCAN axis |
| R-3 | Fail-closed rule (exception, timeout, stale state, unparseable command produce stop) | App C C.1.1 | Matches BE requirements.md; talk implies it via heartbeats |
| R-4 | Envelope schema fields and choices (on_loss only stop, BE-only level, unknown keys rejected, envelope hash rule) | App C C.4; `schemas/envelope.json` | RCAN implementation |
| R-5 | ESTOP message vs hardwired stop distinction | App C C.5 | Consistent with slide 5 |
| R-6 | `gate_decision` record, reference verifier, hash-chain stated limit (tail truncation) | App C C.6; schema; `evidence-chain.ts` | RCAN implementation |
| R-7 | RCAN working descriptions for EV-01..EV-09 and case file | App C C.7; case file; tests README | RCAN's working versions; follow the method |
| R-8 | Out of scope: sensing performance, cybersecurity (IEC 62443), identity mechanics | App C C.8 | Matches BE requirements.md |
| R-9 | Bounded Embodiment results are not certification evidence | `/api`; verify.ts | Consistent |
| R-10 | Dated audit of 2026-09-29 (uses "Enforcement below the model", "EV-01 … EV-09") | `docs/alignment/bounded-embodiment-audit.md` | Left: a dated historical record, not current copy |

## Counts

| Status | Before | After |
|---|---|---|
| SAME | 13 | 45 |
| DIFFERENT | 17 | 0 |
| MISSING | 16 | 1 |
| RCAN-ONLY | 10 | 10 |

## Source (3) vs the slides

- Fixed in a BE PR (text only, not normative): requirements.md standards list said
  "ISO 10218-1/-2, ISO/TS 15066" and lacked ISO/CD 25785-1; R1 name lacked "set by the
  integrator"; R1, R4, R5 "verified by" wording.
- Reported, not changed: method v0.1's `be-hostile/1` stream runs at 50 Hz with bursts up
  to 500 Hz; the slide says 50 Hz. Not a contradiction (the slide's numbers are
  illustrative), but the slide doesn't mention bursts.
- Reported, not changed: requirements.md has no recovery table (protective stop resumes
  when sensor state is fresh, repeated-stop escalation, manual e-stop reset) and doesn't
  say the reject reason goes back to the model. Adding them is new content, not a text fix.
