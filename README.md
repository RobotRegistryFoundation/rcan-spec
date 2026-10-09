# RCAN Specification

**Current canonical version:** see [`rcan.dev/compatibility`](https://rcan.dev/compatibility) (live matrix, signed daily by the OpenCastor compatibility-matrix aggregator — RAN registered at robotregistryfoundation.org).

[![Spec](https://img.shields.io/badge/spec-live%20matrix-blue)](https://rcan.dev/compatibility)
[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green)](https://creativecommons.org/licenses/by/4.0/)
[![CI](https://github.com/RobotRegistryFoundation/rcan-spec/actions/workflows/ci.yml/badge.svg)](https://github.com/RobotRegistryFoundation/rcan-spec/actions)

**[→ Read the spec at rcan.dev/spec/](https://rcan.dev/spec/) · [→ Live compatibility matrix](https://rcan.dev/compatibility)**

<!-- BEGIN: ecosystem certification disclaimer (canonical, derived from spec §10) -->
> **Conformance is not certification.**
>
> Conformance to RCAN tracks (L1–L4 protocol, Gateway Authority, HIL Runtime Safety) is *self-asserted via signed bundles* and *independently replayable from those bundles*. Conformance is not certification. Certification requires audit by a qualified third-party body, which is intentionally out-of-scope for the foundation in 2026.
<!-- END: ecosystem certification disclaimer -->

## Where this fits in the stack

This repo is the **wire-protocol specification** of a small, composable, Apache/MIT-licensed ecosystem. Each layer is independent — adopt one, or all seven.

| Layer | Piece | What it is |
|---|---|---|
| **Declaration** | [ROBOT.md](https://github.com/RobotRegistryFoundation/robot-md) | The file a robot ships at its root. YAML frontmatter + markdown prose. Declares identity, capabilities, safety gates. Spec + Python CLI. |
| **Agent bridge** | [robot-md-mcp](https://github.com/RobotRegistryFoundation/robot-md-mcp) | MCP server that exposes a `ROBOT.md` to Claude Code, Claude Desktop, Cursor, Zed, Gemini CLI — any MCP-aware agent. One `claude mcp add` away. |
| **Wire protocol** ← *this* | [RCAN](https://rcan.dev/spec/) | How robots, gateways, and planners talk. Signed envelopes, LoA enforcement, PQC crypto, EU AI Act §22–§26 compliance artifacts. |
| **Python SDK** | [rcan-py](https://github.com/RobotRegistryFoundation/rcan-py) | `pip install rcan` — RCANMessage, RobotURI, ConfidenceGate, HiTLGate, AuditChain. |
| **TypeScript SDK** | [rcan-ts](https://github.com/RobotRegistryFoundation/rcan-ts) | `npm install rcan-ts` — same API surface for Node + browser. |
| **Registry** | [Robot Registry Foundation](https://robotregistryfoundation.org) | Permanent RRN identities. Public resolver at `/r/<rrn>`. Like ICANN for robots. |
| **Productized runtime (Layer 4)** | [OpenCastor](https://github.com/craigm26/OpenCastor) | Open-source productized RCAN runtime — connects LLM brains to hardware bodies. One implementation of RCAN. |

## What Problem RCAN Solves

Robots today are islands. A Boston Dynamics Spot and a Raspberry Pi rover can't talk to each other, authenticate each other, or safely hand off work to each other — even if they're in the same room. RCAN defines a common addressing scheme (Robot URIs), a message envelope with built-in safety fields, and a federation model so any manufacturer can run their own registry while still interoperating with every other robot on the network. Think of it as DNS + HTTPS, but for robotics.

## Key Concepts

**RRN (Robot Registration Number)** — a permanent, globally unique identifier assigned by the registry. Format: `RRN-000000000001` (root) or `RRN-BD-000000000001` (delegated namespace). Survives hardware swaps and OS reinstalls.

**Robot URI (RURI)** — a resolvable address that embeds the registry, manufacturer, model, version, and device ID: `rcan://registry.rcan.dev/acme/arm/v2/unit-001`.

**R2RAM (Robot-to-Robot Access Model)** — role-based access control for robot-to-robot commands. Five levels: Guest → Observer → User → Operator → Creator. Scopes are fine-grained (read, control, safety, admin).

**Mandatory safety layer (Protocol 66):** local safety always wins; ESTOP is never blocked. Cloud commands pass through the same confidence gates and bounds checks as local commands.

**Physical assurance:** [Appendix C](spec/appendix-c-physical-assurance.md) (informative) applies a simple rule to AI-driven machines: the model proposes, a bounded layer disposes. A small, deterministic gate between the model and the actuators decides what executes, and the safety claim rests on that gate, not on the model. This is prior art (the Simplex architecture, Sha 2001; run-time assurance, ASTM F3269); what the appendix adds is a vendor-neutral test method for machines driven by learned policies. It maps five requirements (declared envelope, enforcement below the model, stop always wins, accountable commands, tamper-evident evidence) onto existing RCAN sections, adds an optional machine-readable [envelope](schemas/envelope.json) and a hash-chained [`gate_decision`](schemas/gate-decision.json) record, and defines tests EV-01 to EV-09 ([status](tests/assurance/README.md)). Physical assurance levels BE-1 to BE-3 are a separate axis from protocol conformance levels L1–L4: an L3 robot can be BE-1. An RCAN ESTOP message and a hardwired power cut are both needed and are not the same thing. It complements, and replaces none of, ISO 10218, ISO/TS 15066, ISO 13482, IEC 60204-1, ISO 13849, IEC 61508 and ITU-T F.748.44. To be presented at the ITU-T FG-EAI workshop on embodied AI, 16 October 2026 (remote); that is not an endorsement. RCAN has one maintainer and no third-party verification. Conformance is not certification.

**Message Types** — 31 defined message types covering commands, telemetry, consent, audit, federation sync, and ESTOP. Every message carries a `msg_id` for replay prevention and a `confidence` field for AI accountability.

## Spec Sections

| Section | Title |
|---|---|
| §1 | Robot URI (RURI) — canonical address format and validation |
| §2 | Role-Based Access Control — 5-level hierarchy, fine-grained scopes |
| §3 | Message Format — common envelope, all 31 MessageType values |
| §4 | Discovery (mDNS) — `_rcan._tcp.local` for LAN-local robot discovery |
| §5 | Authentication — RCAN JWT structure, gateway tokens, verification order |
| §6 | Safety Invariants — local supremacy, graceful degradation, audit trail |
| §7 | Federation — Right to Redirect, Local Supremacy, cross-registry trust |
| §8 | Robot Config (RCAN File) — `.rcan.yaml` schema, required and optional blocks |
| §9 | Capabilities — standard capability names, required scopes, HTTP endpoints |
| §10 | Autonomous Navigation — dead-reckoning waypoint API, physics prereqs |
| §11 | Behavior Scripts — YAML behavior format, step types, Behavior API |
| §12 | Depth & Sensing — depth obstacle zone API, JET colormap, safety integration |
| §13 | Telemetry Streaming — WebSocket endpoint, push rate, required fields |
| §14 | Provider Management — quota fallback, offline fallback, health check |
| §15 | Swarm Coordination — node registry, broadcast commands, safety rules |
| §16 | AI Accountability — confidence gates, HiTL gates, Thought Log |
| §17 | Distributed Registry Node Protocol — node types, RRN namespaces, sync |
| §18 | Capability Advertisement Protocol — Capability Object Map schema |
| §19 | Behavior/Skill Invocation — INVOKE, INVOKE_RESULT, INVOKE_CANCEL |
| §20 | Telemetry Field Registry — joint telemetry schema, Prometheus labels |
| §21 | Robot Registry Integration — RRN↔RURI mapping, ownership proof, L4 conformance |
| §22 | Fundamental Rights Impact Assessment (FRIA) — `rcan-fria-v1` |
| §23 | Safety Benchmark Protocol — `rcan-safety-benchmark-v1` |
| §24 | Instructions for Use (EU AI Act Art. 13) |
| §25 | Post-Market Monitoring (Art. 72) |
| §26 | EU Register Submission (Art. 49) |
| §27 | Reserved: Spatial Intelligence Eval (registry intake exists; spec text not yet written) |
| Appendix B | WebSocket Transport Binding |
| Appendix C | Physical Assurance Profile (Bounded Embodiment), informative |

## SDKs

| SDK | Language | Install |
|---|---|---|
| [rcan-py](https://github.com/RobotRegistryFoundation/rcan-py) | Python 3.10+ | `pip install rcan` |
| [rcan-ts](https://github.com/RobotRegistryFoundation/rcan-ts) | TypeScript / Node 18+ | `npm install rcan-ts` |
| [OpenCastor](https://github.com/craigm26/OpenCastor) | Python (robot runtime) | `pip install opencastor` |

## Companion formats

RCAN defines the *wire* layer (how robots talk). A robot still needs a way to declare *itself* — what it is, what it can do, and what safety envelope it operates under — to any agent that connects to it.

| Format | Purpose | Home |
|---|---|---|
| [**ROBOT.md**](https://robotmd.dev) | Single-file robot manifest (YAML frontmatter + markdown prose) — read by any agent harness (Claude Code, ChatGPT, Gemini, Ollama, …) at session start so the planner knows the robot before the first prompt. Uses `rcan_version` in the frontmatter to pin its RCAN target. | [RobotRegistryFoundation/robot-md](https://github.com/RobotRegistryFoundation/robot-md) |

ROBOT.md is independent of RCAN — you can ship one without the other — but the two compose cleanly: a robot with a ROBOT.md that pins `rcan_version` speaks the [RCAN protocol](https://rcan.dev/spec/) on the wire at the pinned version and declares that fact in its manifest.

## Conformance Badges

Implementations can declare a conformance level in their `/.well-known/rcan-node.json` manifest:

| Level | Name | Requirement |
|---|---|---|
| **L1** | Core | RURI format, mDNS discovery, RBAC, schema validation, §6 audit fields |
| **L2** | Safety | L1 + safe-stop on network loss, prompt-injection defense, audit chain integrity, confidence gates |
| **L3** | AI Accountability | L2 + model identity in audit, HiTL gates and authorization, thought-log scope, offline chain verification |
| **L4** | Registry Integration | L3 + REGISTRY_REGISTER/RESOLVE, RRN validation, ownership proof (§21.6) |

Definitions follow the published suite at [rcan.dev/conformance](https://rcan.dev/conformance) and [`scripts/conformance/`](scripts/conformance/). Conformance is self-asserted; only L1 has an executable live checker today. Conformance is not certification. Physical assurance levels BE-1 to BE-3 (Appendix C) are a separate axis.

## Spec Versioning

RCAN follows a **major.minor** policy. The spec is versioned independently of any SDK. Minor bumps add fields and message types; they never remove or rename existing ones — newer SDKs can read older messages.

For active spec/SDK pairings, see the [live compatibility matrix](https://rcan.dev/compatibility). Full version history at [rcan.dev/changelog](https://rcan.dev/changelog).

## Contributing to the Spec

The spec is an Astro static site deployed to [rcan.dev](https://rcan.dev/spec/).

```bash
npm install
npm run dev      # localhost:4321
npm run build    # production → dist/
npm run test     # schema, registry-function and assurance tests
```

Open issues and proposals at [github.com/RobotRegistryFoundation/rcan-spec/issues](https://github.com/RobotRegistryFoundation/rcan-spec/issues). Major changes go through a public comment period before merging.

## Ecosystem

| Package | Purpose |
|---|---|
| **rcan-spec** (this) | Protocol specification |
| [rcan-py](https://github.com/RobotRegistryFoundation/rcan-py) | Python SDK |
| [rcan-ts](https://github.com/RobotRegistryFoundation/rcan-ts) | TypeScript SDK |
| [OpenCastor](https://github.com/craigm26/OpenCastor) | Productized robot runtime (Layer 4) |
| [RRF](https://robotregistryfoundation.org) | Robot identity registry |
| [Fleet UI](https://app.opencastor.com) | Web fleet dashboard |
| [Docs](https://docs.opencastor.com) | Runtime reference, RCAN, API |

Current versions for all packages: see the [live compatibility matrix](https://rcan.dev/compatibility).

## References

- L. Sha, "Using simplicity to control complexity," *IEEE Software*, 18(4), 2001 (Simplex architecture).
- ASTM F3269, Standard Practice for Methods to Safely Bound Behavior of Aircraft Systems Containing Complex Functions Using Run-Time Assurance.
- ITU-T F.748.44 (benchmarks the model; Appendix C tests the machine around it).

## License

Specification text and schemas: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (full text in [LICENSES/CC-BY-4.0.txt](LICENSES/CC-BY-4.0.txt)).
Reference implementations: MIT.
The licence for the site code and the rest of this repository is still to be decided; see [LICENSE](LICENSE).

---

> **Maintained by one person, Craig Merry, in the [Robot Registry Foundation](https://github.com/RobotRegistryFoundation) GitHub organization.** The foundation is proposed, not incorporated. RCAN is an open specification; issues, proposals, and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
