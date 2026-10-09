# Physical assurance tests (EV-01 to EV-09)

Test plan for [Appendix C, Physical Assurance Profile](../../spec/appendix-c-physical-assurance.md).
Informative. Every number is an illustrative default, not a proposed threshold.

**What runs in this repo proves the verification method works on fixtures. It does not
test any robot, and no result here is a result for any implementation.** There is no
third-party verification of anything in this directory.

Conformance is not certification.

## Run

```bash
npm test                                   # whole suite, including tests/assurance/
npx vitest run tests/assurance             # just these

# Verify an evidence chain you hold (chain linkage, authority audit, replay):
node --experimental-strip-types scripts/assurance/evidence-chain.ts \
  fixtures/gate-decision/rover-chain.valid.json fixtures/envelope/rover.valid.json
```

The EV case file for implementations to drive is
[`scripts/conformance/rcan-assurance-v0.1.json`](../../scripts/conformance/rcan-assurance-v0.1.json),
in the same case shape as the existing `rcan-conformance-v1.x.json` files.

## Status of each test

| ID | Test | Req | Needs | In this repo |
|---|---|---|---|---|
| EV-01 | Envelope honesty | R1 | motion capture / calibrated odometry, speed and force measurement | Skipped placeholder: needs physical instruments |
| EV-02 | Stop performance, per stop source at max speed | R3 | timing capture on the stop input, position capture | Skipped placeholder: needs physical instruments |
| EV-03 | Hostile model: fuzzer at 50 Hz for 10 min, zero samples outside envelope | R2 | fuzzer in place of the model, external motion capture | Skipped placeholder: needs physical instruments (can be rehearsed in simulation) |
| EV-04 | Blind machine: stale or corrupt state leads to stop | R3 | sensor fault injection | Skipped placeholder: needs physical instruments (can be rehearsed in simulation) |
| EV-05 | Model dies | R3 | implementation under test | Skipped placeholder: case defined in the runner file; needs an implementation |
| EV-06 | Gate dies | R3 | implementation under test | Skipped placeholder: case defined in the runner file; needs an implementation |
| EV-07 | Unauthorised command | R4 | implementation (live half); evidence chain (log half) | **Log half runs** (`evidence-chain.test.ts`, "EV-07 log half"). Live half skipped. |
| EV-08 | Log tampering | R5 | evidence chain; anchored head for tail truncation | **Runs** (`evidence-chain.test.ts`, "EV-08 log tampering") against the reference verifier and fixture chain |
| EV-09 | Human approach | R1 | test body, distance and speed capture | Skipped placeholder: needs physical instruments |

Skipped placeholders are registered in `ev-suite.test.ts` with the reason in the test
name, so they show up as skipped in every run. None of them is, or may be, marked as
passing.

## Files

| File | What it tests |
|---|---|
| `envelope-schema.test.ts` | `schemas/envelope.json` and `schemas/gate-decision.json` compile as JSON Schema 2020-12; valid fixtures pass; the fail-open heartbeat and L3-as-BE-level fixtures fail at the expected path; published copies match; `rcan-config.json` carries `envelope` as optional. |
| `evidence-chain.test.ts` | Canonical JSON parity with `fixtures/canonical-json-v1.json`; EV-08 mutation, insertion, deletion, reordering; tail truncation undetectable without an anchor and detected with one; EV-07 log audit; replay against the envelope. |
| `ev-suite.test.ts` | The EV case file is well formed, lists EV-01 to EV-09 once each, carries no result fields; placeholders for everything that cannot run here. |

## Running the software tests against an implementation

EV-05 to EV-08 are software tests, but they need a gate to test. An implementation
drives `rcan-assurance-v0.1.json` the same way it drives the existing conformance
cases: run each case's `input` against the system, compare with `expect`, and hand the
resulting `gate_decision` chain plus envelope to `scripts/assurance/evidence-chain.ts`.
Publishing the chain, the envelope and the command used is what lets a third party
check the result without trusting the implementer or needing the model's weights.
