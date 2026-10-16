/**
 * Appendix C (Physical Assurance Profile): envelope and gate_decision schemas.
 *
 * Schema tests only. A fixture validating says the declaration is well-formed,
 * not that any robot honours it.
 */

import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname ?? ".", "../..");
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf-8"));

const ENVELOPE = read("schemas/envelope.json");
const GATE = read("schemas/gate-decision.json");

function compile(schema: object) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(schema);
}

describe("Appendix C schemas are valid JSON Schema 2020-12", () => {
  it("envelope.json compiles", () => expect(() => compile(ENVELOPE)).not.toThrow());
  it("gate-decision.json compiles", () => expect(() => compile(GATE)).not.toThrow());
  it("published copies under public/schemas match schemas/", () => {
    expect(read("public/schemas/envelope.json")).toEqual(ENVELOPE);
    expect(read("public/schemas/gate-decision.json")).toEqual(GATE);
  });
});

describe("envelope fixtures", () => {
  const validate = compile(ENVELOPE);
  const dir = "fixtures/envelope";
  const files = readdirSync(resolve(root, dir));

  it("has three valid and three invalid fixtures", () => {
    expect(files.filter((f) => f.endsWith(".valid.json"))).toHaveLength(3);
    expect(files.filter((f) => f.endsWith(".invalid.json"))).toHaveLength(3);
  });

  for (const f of files.filter((f) => f.endsWith(".valid.json"))) {
    it(`${f} validates`, () => {
      const ok = validate(read(`${dir}/${f}`));
      expect(validate.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
    });
  }

  it("fail-open heartbeat is rejected at /heartbeat/on_loss", () => {
    expect(validate(read(`${dir}/fail-open-heartbeat.invalid.json`))).toBe(false);
    expect(validate.errors!.map((e) => e.instancePath)).toContain("/heartbeat/on_loss");
  });

  it("an RCAN protocol level (L3) in the assurance level field is rejected", () => {
    expect(validate(read(`${dir}/protocol-level-as-assurance.invalid.json`))).toBe(false);
    expect(validate.errors!.map((e) => e.instancePath)).toContain("/level");
  });

  it("a misspelled limit is rejected rather than ignored", () => {
    const env = read(`${dir}/rover.valid.json`);
    env.motion.max_sped_mps = 5;
    expect(validate(env)).toBe(false);
  });

  it("a proximity rule may not carry both a speed cap and stop", () => {
    const env = read(`${dir}/rover.valid.json`);
    env.proximity[1].max_speed_mps = 0.1;
    expect(validate(env)).toBe(false);
  });

  // Recovery and declared safe state (Appendix C.1.3): optional and additive.
  it("an envelope without safe_state or recovery still validates", () => {
    const env = read(`${dir}/rover.valid.json`);
    expect(env.recovery).toBeUndefined();
    expect(env.stop.safe_state).toBeUndefined();
    expect(validate(env)).toBe(true);
  });

  it("an emergency stop that resets automatically is rejected at /recovery/estop_reset", () => {
    expect(validate(read(`${dir}/estop-auto-restart.invalid.json`))).toBe(false);
    expect(validate.errors!.map((e) => e.instancePath)).toContain("/recovery/estop_reset");
  });

  it("repeated-stop escalation needs a declared count or time", () => {
    const env = read(`${dir}/legged-recovery.valid.json`);
    env.recovery.repeated_stops = { count_window_s: 60 };
    expect(validate(env)).toBe(false);
    env.recovery.repeated_stops = { escalate_after_s: 30 };
    expect(validate(env)).toBe(true);
  });

  it("on_reject accepts only hold or slow_down", () => {
    const env = read(`${dir}/legged-recovery.valid.json`);
    env.recovery.on_reject = "continue";
    expect(validate(env)).toBe(false);
  });

  it("a misspelled recovery key is rejected rather than ignored", () => {
    const env = read(`${dir}/legged-recovery.valid.json`);
    env.recovery.on_rejct = "hold";
    expect(validate(env)).toBe(false);
  });
});

describe("gate_decision records", () => {
  const validate = compile(GATE);
  const chain = read("fixtures/gate-decision/rover-chain.valid.json") as Record<string, unknown>[];

  it("every record in the fixture chain validates", () => {
    for (const rec of chain) {
      const ok = validate(rec);
      expect(validate.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
    }
  });

  it("the fixture chain uses all four decisions", () => {
    expect(new Set(chain.map((r) => r.decision))).toEqual(new Set(["allow", "clamp", "reject", "stop"]));
  });

  it("clamp, reject and stop require a reason", () => {
    for (const d of ["clamp", "reject", "stop"]) {
      const rec = { ...chain.find((r) => r.decision === d)! };
      delete rec.reason;
      expect(validate(rec), d).toBe(false);
    }
  });

  it("reject must apply nothing", () => {
    const rec = { ...chain.find((r) => r.decision === "reject")!, applied: { kind: "motion", linear_mps: 0.1 } };
    expect(validate(rec)).toBe(false);
  });

  it("an unknown decision value is rejected", () => {
    expect(validate({ ...chain[0], decision: "escalate" })).toBe(false);
  });

  it("the original chain carries none of the optional recovery fields", () => {
    for (const rec of chain) {
      expect(rec).not.toHaveProperty("stop_kind");
      expect(rec).not.toHaveProperty("reason_returned");
    }
  });
});

describe("gate_decision recovery fields (Appendix C.1.3)", () => {
  const validate = compile(GATE);
  const chain = read("fixtures/gate-decision/legged-recovery-chain.valid.json") as Record<string, unknown>[];

  it("every record in the recovery chain validates", () => {
    for (const rec of chain) {
      const ok = validate(rec);
      expect(validate.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
    }
  });

  it("the recovery chain uses all three stop kinds and returns reasons to the model", () => {
    expect(new Set(chain.map((r) => r.stop_kind).filter(Boolean))).toEqual(new Set(["protective", "repeated", "emergency"]));
    expect(chain.find((r) => r.decision === "reject")!.reason_returned).toBe(true);
  });

  it("stop_kind is valid only on a stop", () => {
    const rec = { ...chain.find((r) => r.decision === "clamp")!, stop_kind: "protective" };
    expect(validate(rec)).toBe(false);
  });

  it("an unknown stop_kind is rejected", () => {
    const rec = { ...chain.find((r) => r.stop_kind === "protective")!, stop_kind: "soft" };
    expect(validate(rec)).toBe(false);
  });

  it("reason_returned is not valid on an allow", () => {
    const rec = { ...chain.find((r) => r.decision === "allow")!, reason_returned: true };
    expect(validate(rec)).toBe(false);
  });
});

describe("rcan-config carries the envelope as an optional block", () => {
  for (const p of ["schemas/rcan-config.json", "public/schemas/rcan-config.json"]) {
    it(`${p}: envelope is declared and not required`, () => {
      const cfg = read(p);
      expect(cfg.properties.envelope).toBeDefined();
      expect(cfg.required ?? []).not.toContain("envelope");
    });
  }
});
