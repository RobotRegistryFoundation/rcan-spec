/**
 * Appendix C evidence chain: the reference verifier against fixtures.
 *
 * These tests prove the verification procedure catches what it claims to catch.
 * They test the method and the fixtures, not any robot or runtime.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  GENESIS_PREV,
  appendRecord,
  auditAuthority,
  canonicalJson,
  envelopeHash,
  recordHash,
  replayAgainstEnvelope,
  verifyChain,
  type GateDecision,
} from "../../scripts/assurance/evidence-chain.ts";

const root = resolve(import.meta.dirname ?? ".", "../..");
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf-8"));

const ENVELOPE = read("fixtures/envelope/rover.valid.json");
const CHAIN: GateDecision[] = read("fixtures/gate-decision/rover-chain.valid.json");
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const codes = (f: { code: string }[]) => f.map((x) => x.code);

describe("canonical JSON matches fixtures/canonical-json-v1.json", () => {
  const suite = read("fixtures/canonical-json-v1.json");
  for (const c of suite.cases) {
    it(c.name, () => {
      expect(Buffer.from(canonicalJson(c.input), "utf8").toString("base64")).toBe(c.expected_bytes_base64);
    });
  }
});

describe("fixture chain", () => {
  it("verifies clean", () => expect(verifyChain(CHAIN)).toEqual([]));
  it("starts at the genesis prev", () => expect(CHAIN[0].prev).toBe(GENESIS_PREV));
  it("was decided under the rover envelope", () => {
    for (const r of CHAIN) expect(r.envelope).toBe(envelopeHash(ENVELOPE));
  });
  it("envelope hash ignores the signature member", () => {
    expect(envelopeHash({ ...ENVELOPE, signature: "ed25519:other" })).toBe(envelopeHash(ENVELOPE));
  });
});

describe("EV-08 log tampering", () => {
  it("mutating a field is detected", () => {
    const c = clone(CHAIN);
    (c[1].applied as Record<string, number>).linear_mps = 0.9;
    expect(codes(verifyChain(c))).toContain("HASH_MISMATCH");
  });

  it("mutating a field and re-hashing that record breaks the next link", () => {
    const c = clone(CHAIN);
    c[1].decision = "allow";
    c[1].hash = recordHash(c[1]);
    expect(codes(verifyChain(c))).toContain("PREV_MISMATCH");
  });

  it("deleting a record is detected", () => {
    const c = clone(CHAIN);
    c.splice(2, 1);
    expect(codes(verifyChain(c))).toEqual(expect.arrayContaining(["SEQ_GAP", "PREV_MISMATCH"]));
  });

  it("inserting a forged record is detected", () => {
    const c = clone(CHAIN);
    const forged = { ...clone(c[0]), seq: 1, prev: c[0].hash, t: c[0].t + 1 };
    forged.hash = recordHash(forged);
    c.splice(1, 0, forged);
    expect(codes(verifyChain(c))).toEqual(expect.arrayContaining(["SEQ_GAP", "PREV_MISMATCH"]));
  });

  it("reordering records is detected", () => {
    const c = clone(CHAIN);
    [c[2], c[3]] = [c[3], c[2]];
    expect(verifyChain(c).length).toBeGreaterThan(0);
  });

  it("truncating the tail is NOT detectable from the chain alone", () => {
    // Stated limit of a hash chain, asserted so nobody reads the verifier as covering it.
    expect(verifyChain(CHAIN.slice(0, 3))).toEqual([]);
  });

  it("truncating the tail IS detected against an anchored head", () => {
    const head = CHAIN[CHAIN.length - 1].hash;
    expect(codes(verifyChain(CHAIN.slice(0, 3), head))).toEqual(["HEAD_MISMATCH"]);
  });
});

describe("EV-07 log half: accountable commands", () => {
  it("the fixture chain has no executed command without authority", () => {
    expect(auditAuthority(CHAIN, ENVELOPE)).toEqual([]);
  });

  it("an executed motion command with no authority is flagged", () => {
    let c: GateDecision[] = [];
    const { type, t, principal, cmd, applied, envelope, state_digest } = CHAIN[0];
    c = appendRecord(c, { type, t, principal, authority: null, cmd, decision: "allow", applied, envelope, state_digest });
    expect(codes(auditAuthority(c, ENVELOPE))).toEqual(["NO_AUTHORITY"]);
  });

  it("a command kind the envelope does not gate is not flagged", () => {
    const env = { ...ENVELOPE, authority: { required_for: ["gripper"], resolver: "external" } };
    const c = clone(CHAIN).map((r) => ({ ...r, authority: null }));
    expect(auditAuthority(c, env)).toEqual([]);
  });
});

describe("recovery chain (Appendix C.1.3)", () => {
  const LEGGED = read("fixtures/envelope/legged-recovery.valid.json");
  const RC: GateDecision[] = read("fixtures/gate-decision/legged-recovery-chain.valid.json");

  it("verifies, audits and replays clean against its envelope", () => {
    expect(verifyChain(RC)).toEqual([]);
    expect(auditAuthority(RC, LEGGED)).toEqual([]);
    expect(replayAgainstEnvelope(RC, LEGGED)).toEqual([]);
  });

  it("escalates to a repeated stop after the envelope's declared count, not before", () => {
    const n = LEGGED.recovery.repeated_stops.escalate_after_count as number;
    const i = RC.findIndex((r) => r.stop_kind === "repeated");
    const protectiveBefore = RC.slice(0, i).filter((r) => r.stop_kind === "protective");
    expect(protectiveBefore).toHaveLength(n);
    const windowMs = (LEGGED.recovery.repeated_stops.count_window_s as number) * 1000;
    expect(protectiveBefore[n - 1].t - protectiveBefore[0].t).toBeLessThanOrEqual(windowMs);
  });

  it("the optional fields are covered by the record hash", () => {
    const c = clone(RC);
    c[3].stop_kind = "emergency";
    expect(codes(verifyChain(c))).toContain("HASH_MISMATCH");
  });

  it("a stop that applied motion is still flagged when it carries a stop_kind", () => {
    const c = clone(RC);
    (c[3].applied as Record<string, number>).linear_mps = 0.1;
    expect(codes(replayAgainstEnvelope(c, LEGGED))).toContain("STOP_WITH_MOTION");
  });
});

describe("replay against the envelope", () => {
  it("the fixture chain replays clean", () => {
    expect(replayAgainstEnvelope(CHAIN, ENVELOPE)).toEqual([]);
  });

  it("an allow that exceeded max speed is flagged", () => {
    const c = clone(CHAIN);
    (c[0].applied as Record<string, number>).linear_mps = 0.8;
    expect(codes(replayAgainstEnvelope(c, ENVELOPE))).toContain("SPEED_EXCEEDED");
  });

  it("an applied target outside keep_in is flagged", () => {
    const c = clone(CHAIN);
    (c[0].applied as Record<string, unknown>).target = [6.5, 1];
    expect(codes(replayAgainstEnvelope(c, ENVELOPE))).toContain("OUTSIDE_KEEP_IN");
  });

  it("a stop that applied motion is flagged", () => {
    const c = clone(CHAIN);
    const stop = c.find((r) => r.decision === "stop")!;
    (stop.applied as Record<string, number>).linear_mps = 0.1;
    expect(codes(replayAgainstEnvelope(c, ENVELOPE))).toContain("STOP_WITH_MOTION");
  });

  it("a record decided under a different envelope is flagged", () => {
    const tighter = { ...ENVELOPE, motion: { ...ENVELOPE.motion, max_speed_mps: 0.25 } };
    expect(codes(replayAgainstEnvelope(CHAIN, tighter))).toContain("ENVELOPE_MISMATCH");
  });

  it("fields the replay cannot judge are reported, not silently passed", () => {
    const c = clone(CHAIN);
    (c[0].applied as Record<string, unknown>).joint_torque_nm = [1, 2];
    expect(codes(replayAgainstEnvelope(c, ENVELOPE))).toContain("UNCHECKED_FIELDS");
  });
});
