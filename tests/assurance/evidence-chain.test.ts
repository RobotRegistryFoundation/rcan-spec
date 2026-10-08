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

describe("record shape is checked before anything is judged", () => {
  const bad: [string, (c: Record<string, unknown>[]) => void][] = [
    ["seq missing", (c) => delete c[1].seq],
    ["seq a string", (c) => (c[1].seq = "1")],
    ["seq negative", (c) => (c[0].seq = -1)],
    ["seq a fraction", (c) => (c[1].seq = 1.5)],
    ["record not an object", (c) => (c[1] = [] as unknown as Record<string, unknown>)],
  ];
  for (const [name, mutate] of bad) {
    it(`${name}: every check throws TypeError`, () => {
      const c = clone(CHAIN) as unknown as Record<string, unknown>[];
      mutate(c);
      const chain = c as unknown as GateDecision[];
      expect(() => verifyChain(chain)).toThrowError(TypeError);
      expect(() => auditAuthority(chain, ENVELOPE)).toThrowError(TypeError);
      expect(() => replayAgainstEnvelope(chain, ENVELOPE)).toThrowError(TypeError);
    });
  }
  it("verifyChain also needs string prev and hash", () => {
    const c = clone(CHAIN) as unknown as Record<string, unknown>[];
    c[2].hash = 7;
    expect(() => verifyChain(c as unknown as GateDecision[])).toThrowError(TypeError);
  });
});

describe("authority is a non-empty string", () => {
  const executed = (patch: Record<string, unknown>) => {
    const c = clone(CHAIN).slice(0, 1) as unknown as Record<string, unknown>[];
    Object.assign(c[0], patch);
    return c as unknown as GateDecision[];
  };
  it("a number is not an authority", () => {
    expect(codes(auditAuthority(executed({ authority: 5 }), ENVELOPE))).toEqual(["NO_AUTHORITY"]);
  });
  it("true is not a principal", () => {
    expect(codes(auditAuthority(executed({ principal: true }), ENVELOPE))).toEqual(["NO_PRINCIPAL"]);
  });
  it("only an array of strings in required_for gates", () => {
    const c = executed({ authority: null });
    expect(auditAuthority(c, { ...ENVELOPE, authority: { required_for: "motion" } })).toEqual([]);
    expect(auditAuthority(c, { ...ENVELOPE, authority: ["motion"] } as never)).toEqual([]);
    expect(codes(auditAuthority(c, { ...ENVELOPE, authority: { required_for: [1, "motion"] } } as never))).toEqual([
      "NO_AUTHORITY",
    ]);
  });
});

describe("replay checks the decision table (C.1.1, C.6)", () => {
  // Records are edited without re-hashing: replay does not check hashes.
  const at = (seq: number, patch: Record<string, unknown>, drop: string[] = []) => {
    const c = clone(CHAIN) as unknown as Record<string, unknown>[];
    Object.assign(c[seq], patch);
    for (const k of drop) delete c[seq][k];
    return c as unknown as GateDecision[];
  };
  const replayCodes = (c: GateDecision[], env: object = ENVELOPE) =>
    replayAgainstEnvelope(c, env).map((f) => (f.field ? `${f.code}:${f.field}` : f.code));

  it("an allow that changed the command is flagged", () => {
    const applied = { ...(CHAIN[0].applied as object), linear_mps: 0.25 };
    expect(replayCodes(at(0, { applied }))).toEqual(["ALLOW_MODIFIED"]);
  });
  it("an allow equal to its command in another member order passes", () => {
    const { target, kind, angular_radps, linear_mps } = CHAIN[0].cmd as Record<string, unknown>;
    expect(replayCodes(at(0, { applied: { target, linear_mps, kind, angular_radps } }))).toEqual([]);
  });
  it("clamp, reject and stop without a reason are flagged", () => {
    expect(replayCodes(at(1, {}, ["reason"]))).toEqual(["MISSING_REASON"]);
    expect(replayCodes(at(2, { reason: "" }))).toEqual(["MISSING_REASON"]);
    expect(replayCodes(at(4, {}, ["reason"]))).toEqual(["MISSING_REASON"]);
  });
  it("a reject with no applied member is flagged (absent is not null)", () => {
    expect(replayCodes(at(2, {}, ["applied"]))).toEqual(["REJECT_APPLIED"]);
  });
  it("allow, clamp and stop must apply an object", () => {
    expect(replayCodes(at(0, { applied: null }))).toEqual(["APPLIED_NOT_OBJECT"]);
    expect(replayCodes(at(1, { applied: [0.5] }))).toEqual(["APPLIED_NOT_OBJECT"]);
    expect(replayCodes(at(4, {}, ["applied"]))).toEqual(["APPLIED_NOT_OBJECT"]);
  });
  it("an unknown decision is flagged, not judged as allow", () => {
    expect(replayCodes(at(0, { decision: "permit" }))).toEqual(["UNKNOWN_DECISION"]);
  });
});

describe("replay judges only well-typed values", () => {
  const withApplied = (patch: Record<string, unknown>) => {
    const c = clone(CHAIN) as unknown as Record<string, unknown>[];
    c[1].applied = { ...(c[1].applied as object), ...patch };
    return c as unknown as GateDecision[];
  };
  const replayCodes = (c: GateDecision[], env: object = ENVELOPE) =>
    replayAgainstEnvelope(c, env).map((f) => (f.field ? `${f.code}:${f.field}` : f.code));
  const reenvelope = (motion: object, workspace: object) => {
    // Replay compares each record's envelope hash, so rebuild the records under the new one.
    const env = { ...ENVELOPE, motion: { ...ENVELOPE.motion, ...motion }, workspace: { ...ENVELOPE.workspace, ...workspace } };
    const c = clone(CHAIN).map((r) => ({ ...r, envelope: envelopeHash(env) }));
    return { env, c };
  };

  it("a bound written as a string is not used", () => {
    const { env, c } = reenvelope({ max_speed_mps: "0.1" }, {});
    expect(replayCodes(c, env)).toEqual([]);
  });
  it("a two-point keep-out is not a polygon", () => {
    const { env, c } = reenvelope({}, { keep_out: [[[0, 1], [10, 1]]] });
    expect(replayCodes(c, env)).toEqual([]);
  });
  it("a target that is not two finite numbers is unchecked, not tested", () => {
    expect(replayCodes(withApplied({ target: ["99", 1] }))).toEqual(["UNCHECKED_FIELDS:target"]);
  });
  it("a speed written as a string is unchecked, not compared", () => {
    expect(replayCodes(withApplied({ linear_mps: "9" }))).toEqual(["UNCHECKED_FIELDS:linear_mps"]);
  });
  it("unchecked names come once each, sorted by UTF-16 code units, with a field member", () => {
    const c = withApplied({ "": 1, "😀": 1, gripper: 1, B: 1 });
    expect(replayCodes(c)).toEqual([
      "UNCHECKED_FIELDS:B",
      "UNCHECKED_FIELDS:gripper",
      "UNCHECKED_FIELDS:😀",
      "UNCHECKED_FIELDS:",
    ]);
  });
});
