/**
 * Reference verifier for Appendix C gate_decision evidence chains (informative).
 *
 * Three checks a third party can run with nothing but the log and the envelope:
 *   verifyChain           R5: hash linkage, sequence, per-record hash
 *   auditAuthority        R4: every executed authority-gated command names a principal and an authority
 *   replayAgainstEnvelope R5: every applied command sits inside the declared envelope
 *
 * This checks evidence. It does not check a robot, and a passing chain says nothing
 * about whether the machine behaved as the log claims.
 *
 * CLI:
 *   node --experimental-strip-types scripts/assurance/evidence-chain.ts <chain.json> [envelope.json]
 */

import { createHash } from "node:crypto";

export const GENESIS_PREV = "sha256:" + "0".repeat(64);

export type Decision = "allow" | "clamp" | "reject" | "stop";

export interface GateDecision {
  type: "gate_decision";
  seq: number;
  t: number;
  principal: string;
  authority: string | null;
  cmd: Record<string, unknown> | null;
  decision: Decision;
  applied: Record<string, unknown> | null;
  reason?: string;
  envelope: string;
  state_digest: string;
  prev: string;
  hash: string;
}

export interface Finding {
  seq: number | null;
  code: string;
  detail: string;
}

/**
 * Canonical JSON per spec/audit-bundle-v1.md and fixtures/canonical-json-v1.json:
 * keys sorted by UTF-16 code unit, recursively, no whitespace, raw UTF-8.
 * Whole-number floats already serialise as integers in JavaScript.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function sha256(text: string): string {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
}

function without<T extends object>(obj: T, key: string): Record<string, unknown> {
  const { [key]: _omit, ...rest } = obj as Record<string, unknown>;
  return rest;
}

/** Hash of an envelope: canonical JSON with the signature member removed. */
export function envelopeHash(envelope: object): string {
  return sha256(canonicalJson(without(envelope, "signature")));
}

/** Hash of a record: canonical JSON with the hash member removed. */
export function recordHash(record: object): string {
  return sha256(canonicalJson(without(record, "hash")));
}

/** Append a record to a chain, filling seq, prev and hash. Used to build fixtures. */
export function appendRecord(
  chain: GateDecision[],
  partial: Omit<GateDecision, "seq" | "prev" | "hash">,
): GateDecision[] {
  const last = chain[chain.length - 1];
  const rec = {
    ...partial,
    seq: last ? last.seq + 1 : 0,
    prev: last ? last.hash : GENESIS_PREV,
  } as GateDecision;
  rec.hash = recordHash(rec);
  return [...chain, rec];
}

/**
 * EV-08. Detects mutation, insertion, deletion and reordering of records.
 * It cannot detect removal of records from the END of the chain: that needs the
 * last hash anchored somewhere the writer cannot rewrite (a signed checkpoint,
 * a registry, a second log). Callers that hold such an anchor pass it as
 * expectedHead.
 */
export function verifyChain(chain: GateDecision[], expectedHead?: string): Finding[] {
  const findings: Finding[] = [];
  chain.forEach((rec, i) => {
    const expectedPrev = i === 0 ? GENESIS_PREV : chain[i - 1].hash;
    if (i === 0 && rec.seq !== 0) {
      findings.push({ seq: rec.seq, code: "BAD_GENESIS", detail: "first record must have seq 0" });
    }
    if (i > 0 && rec.seq !== chain[i - 1].seq + 1) {
      findings.push({ seq: rec.seq, code: "SEQ_GAP", detail: `expected seq ${chain[i - 1].seq + 1}` });
    }
    if (rec.prev !== expectedPrev) {
      findings.push({ seq: rec.seq, code: "PREV_MISMATCH", detail: "prev does not equal the previous record's hash" });
    }
    if (recordHash(rec) !== rec.hash) {
      findings.push({ seq: rec.seq, code: "HASH_MISMATCH", detail: "record contents do not match its hash" });
    }
  });
  if (expectedHead !== undefined) {
    const head = chain.length ? chain[chain.length - 1].hash : GENESIS_PREV;
    if (head !== expectedHead) {
      findings.push({ seq: null, code: "HEAD_MISMATCH", detail: "chain head does not match the anchored head" });
    }
  }
  return findings;
}

/**
 * EV-07 (log half). An executed command (allow or clamp) whose kind the envelope
 * lists in authority.required_for must carry a principal and an authority.
 * The command kind is read from cmd.kind; a command without a kind is treated as
 * "motion", the conservative reading.
 */
export function auditAuthority(chain: GateDecision[], envelope: { authority?: { required_for?: string[] } }): Finding[] {
  const gated = new Set(envelope.authority?.required_for ?? []);
  const findings: Finding[] = [];
  for (const rec of chain) {
    if (rec.decision !== "allow" && rec.decision !== "clamp") continue;
    const kind = typeof rec.cmd?.kind === "string" ? (rec.cmd.kind as string) : "motion";
    if (!gated.has(kind)) continue;
    if (!rec.principal) {
      findings.push({ seq: rec.seq, code: "NO_PRINCIPAL", detail: `executed ${kind} command has no principal` });
    }
    if (!rec.authority) {
      findings.push({ seq: rec.seq, code: "NO_AUTHORITY", detail: `executed ${kind} command has no authority` });
    }
  }
  return findings;
}

type Point = [number, number];

function insidePolygon([x, y]: Point, poly: Point[]): boolean {
  // Ray casting. Points exactly on an edge count as inside.
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    const onSegment =
      Math.abs(cross) < 1e-12 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj);
    if (onSegment) return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface EnvelopeLike {
  workspace?: { keep_in?: Point[]; keep_out?: Point[][] };
  motion?: { max_speed_mps?: number; max_turn_radps?: number };
}

/**
 * Replay every applied command against the envelope. Understands the illustrative
 * command shape used in Appendix C: { linear_mps, angular_radps, target: [x, y] }.
 * Fields it does not understand are not judged, and the replay says so by
 * returning UNCHECKED_FIELDS once per field name, so silence is never read as a pass.
 */
export function replayAgainstEnvelope(chain: GateDecision[], envelope: EnvelopeLike & object): Finding[] {
  const findings: Finding[] = [];
  const hash = envelopeHash(envelope);
  const unchecked = new Set<string>();
  const known = new Set(["kind", "linear_mps", "angular_radps", "target"]);
  const maxV = envelope.motion?.max_speed_mps;
  const maxW = envelope.motion?.max_turn_radps;
  const keepIn = envelope.workspace?.keep_in;
  const keepOut = envelope.workspace?.keep_out ?? [];

  for (const rec of chain) {
    if (rec.envelope !== hash) {
      findings.push({ seq: rec.seq, code: "ENVELOPE_MISMATCH", detail: "record was decided under a different envelope" });
    }
    if (rec.decision === "reject") {
      if (rec.applied !== null) findings.push({ seq: rec.seq, code: "REJECT_APPLIED", detail: "reject must apply nothing" });
      continue;
    }
    const a = rec.applied ?? {};
    for (const k of Object.keys(a)) if (!known.has(k)) unchecked.add(k);
    const v = typeof a.linear_mps === "number" ? a.linear_mps : undefined;
    const w = typeof a.angular_radps === "number" ? a.angular_radps : undefined;

    if (rec.decision === "stop") {
      if ((v !== undefined && v !== 0) || (w !== undefined && w !== 0)) {
        findings.push({ seq: rec.seq, code: "STOP_WITH_MOTION", detail: "stop applied a non-zero velocity" });
      }
      continue;
    }
    if (v !== undefined && maxV !== undefined && Math.abs(v) > maxV) {
      findings.push({ seq: rec.seq, code: "SPEED_EXCEEDED", detail: `|${v}| > max_speed_mps ${maxV}` });
    }
    if (w !== undefined && maxW !== undefined && Math.abs(w) > maxW) {
      findings.push({ seq: rec.seq, code: "TURN_EXCEEDED", detail: `|${w}| > max_turn_radps ${maxW}` });
    }
    const target = a.target as Point | undefined;
    if (Array.isArray(target) && target.length === 2) {
      if (keepIn && !insidePolygon(target, keepIn)) {
        findings.push({ seq: rec.seq, code: "OUTSIDE_KEEP_IN", detail: `target ${JSON.stringify(target)} outside keep_in` });
      }
      for (const zone of keepOut) {
        if (insidePolygon(target, zone)) {
          findings.push({ seq: rec.seq, code: "INSIDE_KEEP_OUT", detail: `target ${JSON.stringify(target)} inside keep_out` });
        }
      }
    }
  }
  for (const k of unchecked) {
    findings.push({ seq: null, code: "UNCHECKED_FIELDS", detail: `applied.${k} is not judged by this reference replay` });
  }
  return findings;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = typeof process !== "undefined" && process.argv[1]?.endsWith("evidence-chain.ts");
if (isMain) {
  const { readFileSync } = await import("node:fs");
  const [chainPath, envelopePath] = process.argv.slice(2);
  if (!chainPath) {
    console.error("usage: evidence-chain.ts <chain.json> [envelope.json]");
    process.exit(2);
  }
  const chain = JSON.parse(readFileSync(chainPath, "utf8")) as GateDecision[];
  const findings = [...verifyChain(chain)];
  if (envelopePath) {
    const envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
    findings.push(...auditAuthority(chain, envelope), ...replayAgainstEnvelope(chain, envelope));
  }
  for (const f of findings) console.log(`${f.seq ?? "-"}\t${f.code}\t${f.detail}`);
  const hard = findings.filter((f) => f.code !== "UNCHECKED_FIELDS");
  console.log(hard.length ? `FAIL: ${hard.length} finding(s) over ${chain.length} record(s)` : `OK: ${chain.length} record(s)`);
  process.exit(hard.length ? 1 : 0);
}
