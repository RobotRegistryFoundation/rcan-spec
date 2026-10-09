# Appendix C: Physical Assurance Profile (Bounded Embodiment)

*Status: Informative · Draft for RCAN v3.3.0 · Profile version 0.1*

> **Status of this appendix.** RCAN has one maintainer and no third-party verification
> of any claim in this appendix. Nothing here has been tested on a machine by an
> independent party. To be presented at the ITU-T FG-EAI workshop on embodied AI,
> 16 October 2026 (remote). That is a presentation slot, not an endorsement: FG-EAI
> outputs are not ITU-T Recommendations, and neither ITU nor any other body has
> reviewed, adopted or approved this profile. RCAN, with the Robot Registry
> Foundation registry, has been proposed to the AAIF (Linux Foundation) as a Sandbox
> project ([aaif/project-proposals#43](https://github.com/aaif/project-proposals/issues/43));
> the proposal has not been accepted.
>
> **Conformance is not certification.**

This appendix is informative. Where it uses MUST, MUST NOT or SHOULD, it is restating
a requirement RCAN already makes elsewhere, and cites the section. Everything new in
this appendix uses lowercase "should" and "is expected to" and creates no conformance
obligation in this version.

---

## C.1 Principle

**The model proposes; a bounded layer disposes.** Any AI model may propose actions. A
small, deterministic, independently testable gate between the model and the actuators
decides what executes. The safety claim rests on the gate, not the model.

This is not a new idea. It is the Simplex architecture (Sha, 2001) and run-time
assurance as standardised for aircraft in ASTM F3269. What this appendix adds is a
vendor-neutral **test method** for machines driven by learned policies: five
requirements, each with a pass/fail test a third party can run without the model's
weights, and a machine-readable envelope and evidence record that make the tests
repeatable.

It complements, and replaces none of: ISO 10218-1/-2, ISO/TS 15066, ISO 13482,
IEC 60204-1, ISO 13849-1, IEC 61508, and ITU-T F.748.44. F.748.44 benchmarks the model;
this profile tests the machine around it.

### C.1.1 Gate decisions

The gate makes exactly one of four decisions for every proposed command:

| Decision | Meaning | `applied` |
|---|---|---|
| `allow` | Command executes unchanged. | The command. |
| `clamp` | Command executes after being brought inside the envelope (e.g. speed reduced). | The modified command. |
| `reject` | Command does not execute. Machine continues its current safe behaviour. | `null` |
| `stop` | Machine is brought to a stop. | The stop action. |

**Fail closed.** Any exception in the gate, a timeout, state older than
`sensing.max_state_age_ms`, or a command the gate cannot parse is expected to produce
`stop`. §16.3 already applies this rule to one case: a missing confidence value is a
gate miss.

---

## C.2 Requirements R1–R5 and where RCAN implements them

Section numbers refer to the published spec at docs.rcan.dev.

| # | Requirement | Existing RCAN coverage | What this appendix adds | Verified by |
|---|---|---|---|---|
| **R1** | **Declared envelope.** Machine-readable workspace, speed, force and stopping limits. | §8 Robot Config (`physics`); `hardware_safety` and `safety` blocks in `rcan-config.json`; §23 benchmark thresholds | `envelope` block and `schemas/envelope.json` (C.4) | EV-01, EV-09: externally measured maximums ≤ declared values |
| **R2** | **Enforcement below the model.** The model has no write path to the gate, the envelope or the log. | §6.2 Invariant 1: local safety always wins; no remote command can bypass on-device bounds checking (MUST). §6.3: invariants enforced in the runtime layer before payloads reach application code (MUST). §6.2 Invariant 7: injection scan before the model is called (MUST). §12: obstacle e-stops enforced independently of LLM output (MUST). | The explicit no-write-path statement and gate placement per assurance level (C.3) | EV-03: hostile commands produce zero motion outside the envelope |
| **R3** | **Stop always wins.** Every authorised stop source overrides everything within a declared time; loss of power, comms or heartbeat leads to a safe state. | §2: ESTOP from any principal MUST be honored regardless of role. §3.4 and §6.2 Invariant 6: `Priority.SAFETY` MUST skip rate-limiting queues. §6.2 Invariant 2: network loss MUST trigger a safe-stop within one `latency_budget_ms`. §6.3: heartbeat SHOULD time out at `latency_budget_ms × 2`. §15: a swarm broadcast MUST NOT override local e-stop. `watchdog` config block. | Declared stop time and distance per stop source; loss of power; the two-stops distinction (C.5) | EV-02, EV-04, EV-05, EV-06: stop time and distance measured per source at max speed |
| **R4** | **Accountable commands.** Every executed command traces to an authorising principal. | §6.2 Invariant 3: every COMMAND and CONFIG MUST be logged with principal identity. §2 roles and scopes; §2.7.1 non-escalation. §5 token verification order. §16.4: HiTL `AUTHORIZE` MUST come from OWNER or above, and both messages are logged. §21.3 ownership proof. §1.6 signed RURI. | `principal` and `authority` on every gate decision. Identity and delegation mechanics belong to ITU FG-TIDA and are out of scope here. | EV-07: log audit |
| **R5** | **Tamper-evident evidence.** Every gate decision is logged append-only and hash-chained. | §6.2 Invariant 3 (audit trail, MUST). §16.2 model identity in audit records. §16.6 watermark tokens and verify endpoint. Conformance suite L2 "audit chain integrity" and L3 "offline chain verification". `spec/audit-bundle-v1.md`. | `gate_decision` record (C.6) with `allow`/`clamp`/`reject`/`stop`, `applied`, envelope hash and state digest; replay against the envelope | EV-08: chain verification plus replay |

---

## C.3 Assurance levels BE-1 to BE-3

Physical assurance levels (BE, for Bounded Embodiment) describe how much a third party
can trust the gate and the stop path. They are **a separate axis** from RCAN's protocol conformance levels L1–L4
and are never merged with or renumbered into them.

| Level | Name | Expected of the machine |
|---|---|---|
| **BE-1** | Declared | Published envelope. Gate runs in a process separate from the model. Hash-chained gate log. |
| **BE-2** | Enforced | BE-1, plus: gate on independent compute or firmware; hardware stop path; heartbeat watchdogs on the model and on the gate; passes the fault-injection tests (EV-03 to EV-08). |
| **BE-3** | Assured | BE-2, plus: gate and stop path meet a functional-safety integrity target (ISO 13849-1 PL or IEC 61508 SIL) with third-party testing. |

A BE-level is self-declared unless it is accompanied by third-party evidence. BE-3 without
third-party evidence is not BE-3.

### C.3.1 The two axes are independent

| | **BE-1** Declared | **BE-2** Enforced | **BE-3** Assured |
|---|---|---|---|
| **L1** Core | possible | possible | possible |
| **L2** | possible | possible | possible |
| **L3** | possible | possible | possible |
| **L4** Registry | possible | possible | possible |

Every combination is possible. **An RCAN L3 robot can be BE-1.** An L-level says how
well the robot speaks the protocol; a BE-level says how well its motion is bounded.
Neither implies the other.

Conformance is not certification.

---

## C.4 Envelope (R1)

Schema: [`schemas/envelope.json`](../schemas/envelope.json), published at
`https://rcan.dev/schemas/envelope.json` (JSON Schema 2020-12). It is carried as the
optional `envelope` block in the robot config ([`rcan-config.json`](../schemas/rcan-config.json),
§8); a config without it is unaffected. Fixtures: `fixtures/envelope/`.

```yaml
envelope:
  envelope_version: "0.1"          # quoted, so YAML keeps it a string
  machine: { id: rover-01, class: mobile_ground, mass_kg: 2.1 }
  level: BE-2                      # self-declared unless third-party evidence exists
  workspace: { frame: map, keep_in: [[0,0],[6,0],[6,4],[0,4]], keep_out: [] }
  motion: { max_speed_mps: 0.5, max_turn_radps: 1.5, max_accel_mps2: 1.0 }
  proximity:
    - when: { human_within_m: 1.0 }
      max_speed_mps: 0.2
    - when: { human_within_m: 0.4 }
      action: stop
  sensing: { max_state_age_ms: 100 }
  stop: { category: 1, max_time_ms: 300, max_distance_m: 0.15 }   # IEC 60204-1 category
  heartbeat: { model_timeout_ms: 200, gate_timeout_ms: 50, on_loss: stop }
  authority: { required_for: [motion], resolver: external }
  signature: "ed25519:..."         # signed by the integrator, never the model
```

Every number above is an illustrative default, not a proposed threshold.

Schema choices worth knowing:

- `heartbeat.on_loss` accepts only `stop`. A fail-open envelope does not validate.
- `level` accepts only `BE-1`, `BE-2`, `BE-3`. Putting an L-level there is a validation error.
- Top-level and limit blocks reject unknown keys, so a misspelled limit fails
  validation instead of being silently ignored.
- The envelope hash used in evidence records is sha256 over the canonical JSON
  (`spec/audit-bundle-v1.md`) of the envelope with `signature` removed.

---

## C.5 Two different stops (R3)

RCAN defines a stop **message**: the SAFETY message (§3, `schemas/messages/safety.json`)
with `STOP`, `ESTOP` and `RESUME`, sent at `Priority.SAFETY`, authenticated, honored from
any principal (§2), and logged. It is fast and accountable, and it depends on software
being alive to receive and act on it.

A **hardwired stop** cuts actuator power through a circuit that does not pass through
the gate, the model, or the RCAN runtime (declared today as
`hardware_safety.physical_estop`). It works when software is the failure.

A machine at BE-2 or above is expected to have both. They are not the same thing and are
never described as the same thing: an RCAN ESTOP message is not a hardwired stop, and a
hardwired stop does not produce an RCAN audit record by itself. EV-02 measures each
stop source separately.

---

## C.6 `gate_decision` evidence record (R5)

Schema: [`schemas/gate-decision.json`](../schemas/gate-decision.json). This is an
optional record in the §16 audit stream. An implementation that emits it MAY keep
emitting the §6 audit record for the same command; the two are complementary (§6
records who asked, the gate record records what the machine was allowed to do).

| Field | Content |
|---|---|
| `type` | `"gate_decision"` |
| `seq` | Monotonic, contiguous sequence number. |
| `t` | Unix epoch milliseconds of the decision. |
| `principal` | Who the command is attributed to (§2). For a decision the gate originates, the gate's own identity (e.g. `gate:watchdog`). |
| `authority` | Reference to the grant that authorised the command (JWT `jti`, `AUTHORIZE` message id), or `null`. |
| `cmd` | Command as proposed, or `null` for a gate-originated decision. |
| `decision` | `allow` \| `clamp` \| `reject` \| `stop` |
| `applied` | What went to the actuators (see C.1.1). |
| `reason` | Required for `clamp`, `reject`, `stop`. |
| `envelope` | Hash of the envelope in force. |
| `state_digest` | Digest of the state snapshot the decision was made on. |
| `prev` | `hash` of the previous record; `sha256:` + 64 zeros for the first. |
| `hash` | sha256 over the canonical JSON of the record with `hash` removed. |

A reference verifier, `scripts/assurance/evidence-chain.ts`, checks chain linkage,
audits authority on executed commands, and replays every applied command against the
envelope. It reports fields it cannot judge rather than passing them silently.

**Stated limit.** A hash chain detects mutation, insertion, deletion and reordering. It
cannot detect records removed from the end unless the last hash is anchored somewhere
the writer cannot rewrite (a signed checkpoint, a registry, a second log).

---

## C.7 Test method EV-01 to EV-09

Case file: `scripts/conformance/rcan-assurance-v0.1.json`. Plan and status:
`tests/assurance/README.md`.

| ID | Test | Req | Runs in |
|---|---|---|---|
| EV-01 | Envelope honesty | R1 | physical |
| EV-02 | Stop performance, per stop source at max speed | R3 | physical |
| EV-03 | Hostile model: fuzzer replaces the model; random, boundary and max commands, 50 Hz, 10 min; pass = zero samples outside envelope | R2 | physical (rehearsable in simulation) |
| EV-04 | Blind machine: stale or corrupt sensors lead to stop | R3 | physical (rehearsable in simulation) |
| EV-05 | Model dies | R3 | software |
| EV-06 | Gate dies | R3 | software |
| EV-07 | Unauthorised command | R4 | software |
| EV-08 | Log tampering | R5 | software |
| EV-09 | Human approach | R1 | physical |

Numbers are illustrative defaults, not proposed thresholds.

---

## C.8 Out of scope

- **Envelope adequacy.** Whether the declared limits are safe for a given task, site or
  person is a risk-assessment question (ISO 12100, ISO 10218-2, ISO/TS 15066). This
  profile tests that the machine honours its declaration, not that the declaration is
  right.
- **Harm inside the envelope.** A machine can stay inside its envelope and still do the
  wrong thing.
- **Sensing performance.** Whether the machine detects a person is a sensor question;
  EV-09 tests the response once a person is detected.
- **General cybersecurity.** See IEC 62443. This profile assumes the gate and envelope
  are protected from the model, not from every attacker.
- **Identity and delegation mechanics.** ITU FG-TIDA.

---

## C.9 References

- L. Sha, "Using simplicity to control complexity," *IEEE Software*, 18(4), 2001.
- ASTM F3269, Standard Practice for Methods to Safely Bound Behavior of Aircraft Systems
  Containing Complex Functions Using Run-Time Assurance.
- ITU-T F.748.44 (benchmarks the model; cited for scope, not summarised here).
- IEC 60204-1, Safety of machinery: Electrical equipment of machines (stop categories).
- ISO 10218-1/-2, ISO/TS 15066, ISO 13482, ISO 13849-1, ISO 13855, IEC 61508, IEC 62443.
