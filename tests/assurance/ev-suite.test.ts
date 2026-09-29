/**
 * EV-01..EV-09 (Appendix C). The case file lives with the other conformance
 * cases in scripts/conformance/rcan-assurance-v0.1.json.
 *
 * Only the parts that can run offline in this repo are executed here (EV-07 log
 * half, EV-08; see evidence-chain.test.ts). Everything else needs an
 * implementation under test or physical instruments and is registered as a
 * skipped placeholder with the reason in its name. A skipped test is not a pass.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname ?? ".", "../..");
const SUITE = JSON.parse(readFileSync(resolve(root, "scripts/conformance/rcan-assurance-v0.1.json"), "utf-8"));

interface Case {
  id: string;
  name: string;
  requirement: string;
  runnable_in: "software" | "physical";
  needs: string[];
  description: string;
  test_type: string;
  input: unknown;
  expect: unknown;
}
const CASES: Case[] = SUITE.tests;

describe("rcan-assurance-v0.1.json case file", () => {
  it("is marked informative with illustrative thresholds", () => {
    expect(SUITE.informative).toBe(true);
    expect(SUITE.thresholds_are_illustrative).toBe(true);
  });

  it("defines EV-01..EV-09 exactly once each, in order", () => {
    expect(CASES.map((c) => c.id)).toEqual(Array.from({ length: 9 }, (_, i) => `EV-0${i + 1}`));
  });

  it("every case has the conformance case shape plus requirement/runnable_in/needs", () => {
    for (const c of CASES) {
      for (const k of ["id", "name", "description", "test_type", "input", "expect", "requirement", "runnable_in", "needs"]) {
        expect(c, `${c.id}.${k}`).toHaveProperty(k);
      }
      expect(["R1", "R2", "R3", "R4", "R5"]).toContain(c.requirement);
      expect(["software", "physical"]).toContain(c.runnable_in);
    }
  });

  it("EV-05, EV-06, EV-07 and EV-08 are runnable in software", () => {
    const sw = CASES.filter((c) => c.runnable_in === "software").map((c) => c.id);
    expect(sw).toEqual(["EV-05", "EV-06", "EV-07", "EV-08"]);
  });

  it("no case carries a result field", () => {
    for (const c of CASES) {
      expect(c).not.toHaveProperty("result");
      expect(c).not.toHaveProperty("passed");
    }
  });
});

// Placeholders: registered so the gap is visible in every test run.
const OFFLINE_HERE = new Set(["EV-07", "EV-08"]);
describe("EV placeholders (need an implementation or instruments)", () => {
  for (const c of CASES) {
    const reason =
      c.runnable_in === "physical"
        ? `needs physical instruments: ${c.needs.join(", ")}`
        : OFFLINE_HERE.has(c.id)
          ? "live half needs an implementation under test (offline half runs in evidence-chain.test.ts)"
          : "needs an implementation under test; drive scripts/conformance/rcan-assurance-v0.1.json against it";
    it.skip(`${c.id} ${c.name}: ${reason}`, () => {});
  }
});
