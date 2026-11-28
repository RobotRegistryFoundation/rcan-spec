/**
 * The verifier's command line, run the way its header says to run it:
 * `node --experimental-strip-types scripts/assurance/evidence-chain.ts`. Running it
 * under Node's type stripping (not only through the test bundler) also catches
 * TypeScript syntax that stripping cannot handle.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const root = resolve(import.meta.dirname ?? ".", "../..");
const SCRIPT = resolve(root, "scripts/assurance/evidence-chain.ts");
const CHAIN = resolve(root, "fixtures/gate-decision/rover-chain.valid.json");
const ENVELOPE = resolve(root, "fixtures/envelope/rover.valid.json");

const run = (...args: string[]) =>
  spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", SCRIPT, ...args], { encoding: "utf8" });

// The flag exists from Node 22.6; under older Node (the deploy workflow uses 20)
// the command line cannot run as documented, so these tests are skipped there.
const stripTypes = spawnSync(process.execPath, ["--experimental-strip-types", "-e", ""]).status === 0;

function tempChain(edit: (chain: Record<string, unknown>[]) => void): string {
  const chain = JSON.parse(readFileSync(CHAIN, "utf8"));
  edit(chain);
  const path = join(mkdtempSync(join(tmpdir(), "evidence-chain-")), "chain.json");
  writeFileSync(path, JSON.stringify(chain));
  return path;
}

describe.skipIf(!stripTypes)("evidence-chain.ts command line (Node 22.6+)", () => {
  it("exits 0 on the fixture chain and envelope", () => {
    const r = run(CHAIN, ENVELOPE);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("OK: 6 record(s)");
  });

  it("exits 1 when there are findings", () => {
    const r = run(tempChain((c) => ((c[1].applied as Record<string, number>).linear_mps = 0.9)), ENVELOPE);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("HASH_MISMATCH");
  });

  it("exits 2 without arguments", () => {
    expect(run().status).toBe(2);
  });

  it("exits 3, not 1, when the input cannot be checked", () => {
    expect(run(tempChain((c) => delete c[1].seq), ENVELOPE).status).toBe(3);
    expect(run(join(tmpdir(), "no-such-chain.json")).status).toBe(3);
    expect(run(CHAIN, CHAIN).status).toBe(3); // an array is not an envelope
  });
});
