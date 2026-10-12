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
 * Every check needs records that are objects with a non-negative integer seq (and,
 * for verifyChain, string prev and hash). Input without that shape is not evidence
 * of anything, so it throws a TypeError instead of being judged.
 *
 * CLI:
 *   node --experimental-strip-types scripts/assurance/evidence-chain.ts <chain.json> [envelope.json]
 * Exit status: 0 no findings (UNCHECKED_FIELDS alone is not a failure), 1 findings,
 * 2 usage, 3 the input could not be checked (unreadable, not JSON, malformed records,
 * or a value with no canonical form).
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
  /** The member name, for UNCHECKED_FIELDS only. */
  field?: string;
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

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const nonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * The record shape the checks rely on. Without it a finding means nothing: a missing
 * seq used to produce "expected seq NaN", and a string seq was compared as a string.
 */
function requireRecords(chain: unknown, links: boolean): void {
  if (!Array.isArray(chain)) throw new TypeError("records: expected an array of gate_decision records");
  chain.forEach((rec, i) => {
    if (!isObject(rec)) throw new TypeError(`records[${i}]: not an object`);
    if (!(typeof rec.seq === "number" && Number.isInteger(rec.seq) && rec.seq >= 0)) {
      throw new TypeError(`records[${i}]: seq must be a non-negative integer`);
    }
    if (links && (typeof rec.prev !== "string" || typeof rec.hash !== "string")) {
      throw new TypeError(`records[${i}]: prev and hash must be strings`);
    }
  });
}

/**
 * EV-08. Detects mutation, insertion, deletion and reordering of records.
 * It cannot detect removal of records from the END of the chain: that needs the
 * last hash anchored somewhere the writer cannot rewrite (a signed checkpoint,
 * a registry, a second log). Callers that hold such an anchor pass it as
 * expectedHead.
 */
export function verifyChain(chain: GateDecision[], expectedHead?: string): Finding[] {
  requireRecords(chain, true);
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
 * lists in authority.required_for must carry a principal and an authority, each a
 * non-empty string (the record schema's types; `authority: 5` is not a grant).
 * The command kind is read from cmd.kind; a command without a kind is treated as
 * "motion", the conservative reading. Only string entries of required_for gate.
 */
export function auditAuthority(chain: GateDecision[], envelope: { authority?: { required_for?: string[] } }): Finding[] {
  requireRecords(chain, false);
  const authority: unknown = envelope.authority;
  const requiredFor = isObject(authority) ? authority.required_for : undefined;
  const gated = new Set(Array.isArray(requiredFor) ? requiredFor.filter((k) => typeof k === "string") : []);
  const findings: Finding[] = [];
  for (const rec of chain) {
    if (rec.decision !== "allow" && rec.decision !== "clamp") continue;
    const cmd: unknown = rec.cmd;
    const kind = isObject(cmd) && typeof cmd.kind === "string" ? cmd.kind : "motion";
    if (!gated.has(kind)) continue;
    if (!nonEmptyString(rec.principal)) {
      findings.push({ seq: rec.seq, code: "NO_PRINCIPAL", detail: `executed ${kind} command has no principal` });
    }
    if (!nonEmptyString(rec.authority)) {
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

const DECISIONS = new Set(["allow", "clamp", "reject", "stop"]);
const isNumber = (v: unknown): v is number => typeof v === "number";
/** Two finite numbers. */
const isPoint = (v: unknown): v is Point =>
  Array.isArray(v) && v.length === 2 && v.every((c) => typeof c === "number" && Number.isFinite(c));
/** Three or more points. */
const isPolygon = (v: unknown): v is Point[] => Array.isArray(v) && v.length >= 3 && v.every(isPoint);

/**
 * Replay every record against the envelope and against the decision table in
 * Appendix C (C.1.1, C.6): allow applies the command unchanged; clamp, reject and
 * stop carry a reason; reject applies null; the others apply an object.
 *
 * Understands the illustrative command shape used in Appendix C:
 * { kind, linear_mps, angular_radps, target: [x, y] }. A bound, polygon or target is
 * used only when it has the type replay needs (a number; three or more points; two
 * finite numbers), so no value is judged through type coercion; whether the envelope
 * is well formed is schema validation's job. Members of applied that replay cannot
 * judge, because the name is unknown or the value unusable, are reported as
 * UNCHECKED_FIELDS once per name, sorted, so silence is never read as a pass.
 */
export function replayAgainstEnvelope(chain: GateDecision[], envelope: EnvelopeLike & object): Finding[] {
  requireRecords(chain, false);
  const findings: Finding[] = [];
  const hash = envelopeHash(envelope);
  const unchecked = new Set<string>();
  const motion: Record<string, unknown> = isObject(envelope.motion) ? envelope.motion : {};
  const workspace: Record<string, unknown> = isObject(envelope.workspace) ? envelope.workspace : {};
  const maxV = isNumber(motion.max_speed_mps) ? motion.max_speed_mps : undefined;
  const maxW = isNumber(motion.max_turn_radps) ? motion.max_turn_radps : undefined;
  const keepIn = isPolygon(workspace.keep_in) ? workspace.keep_in : undefined;
  const keepOut = Array.isArray(workspace.keep_out) ? workspace.keep_out.filter(isPolygon) : [];

  for (const rec of chain) {
    const seq = rec.seq;
    if (rec.envelope !== hash) {
      findings.push({ seq, code: "ENVELOPE_MISMATCH", detail: "record was decided under a different envelope" });
    }
    if (!DECISIONS.has(rec.decision)) {
      findings.push({ seq, code: "UNKNOWN_DECISION", detail: `decision ${JSON.stringify(rec.decision)} is not allow, clamp, reject or stop` });
      continue;
    }
    const applied: unknown = rec.applied;
    if (rec.decision === "reject") {
      // A missing applied member is not the null that reject requires.
      if (!Object.hasOwn(rec, "applied") || applied !== null) {
        findings.push({ seq, code: "REJECT_APPLIED", detail: "reject must apply null" });
      }
    } else if (!isObject(applied)) {
      findings.push({ seq, code: "APPLIED_NOT_OBJECT", detail: `${rec.decision} must apply an object` });
    } else {
      const v = isNumber(applied.linear_mps) ? applied.linear_mps : undefined;
      const w = isNumber(applied.angular_radps) ? applied.angular_radps : undefined;
      const target = rec.decision !== "stop" && isPoint(applied.target) ? applied.target : undefined;
      for (const k of Object.keys(applied)) {
        const judged =
          k === "kind" ||
          (k === "linear_mps" && v !== undefined) ||
          (k === "angular_radps" && w !== undefined) ||
          (k === "target" && target !== undefined);
        if (!judged) unchecked.add(k);
      }
      if (rec.decision === "stop") {
        if ((v !== undefined && v !== 0) || (w !== undefined && w !== 0)) {
          findings.push({ seq, code: "STOP_WITH_MOTION", detail: "stop applied a non-zero velocity" });
        }
      } else {
        if (v !== undefined && maxV !== undefined && Math.abs(v) > maxV) {
          findings.push({ seq, code: "SPEED_EXCEEDED", detail: `|${v}| > max_speed_mps ${maxV}` });
        }
        if (w !== undefined && maxW !== undefined && Math.abs(w) > maxW) {
          findings.push({ seq, code: "TURN_EXCEEDED", detail: `|${w}| > max_turn_radps ${maxW}` });
        }
        if (target) {
          if (keepIn && !insidePolygon(target, keepIn)) {
            findings.push({ seq, code: "OUTSIDE_KEEP_IN", detail: `target ${JSON.stringify(target)} outside keep_in` });
          }
          for (const zone of keepOut) {
            if (insidePolygon(target, zone)) {
              findings.push({ seq, code: "INSIDE_KEEP_OUT", detail: `target ${JSON.stringify(target)} inside keep_out` });
            }
          }
        }
        // A missing cmd counts as null.
        if (rec.decision === "allow" && canonicalJson(applied) !== canonicalJson(rec.cmd ?? null)) {
          findings.push({ seq, code: "ALLOW_MODIFIED", detail: "allow must apply the command unchanged" });
        }
      }
    }
    if (rec.decision !== "allow" && !nonEmptyString(rec.reason)) {
      findings.push({ seq, code: "MISSING_REASON", detail: `${rec.decision} must give a reason` });
    }
  }
  for (const k of [...unchecked].sort()) {
    findings.push({ seq: null, code: "UNCHECKED_FIELDS", field: k, detail: `applied.${k} is not judged by this reference replay` });
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
  let chain: GateDecision[];
  let findings: Finding[];
  try {
    chain = JSON.parse(readFileSync(chainPath, "utf8"));
    findings = [...verifyChain(chain)];
    if (envelopePath) {
      const envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
      if (!isObject(envelope)) throw new TypeError("envelope: not an object");
      findings.push(...auditAuthority(chain, envelope), ...replayAgainstEnvelope(chain, envelope));
    }
  } catch (e) {
    // The evidence could not be checked, which must not read like a finding.
    console.error(`error: ${(e as Error).message}`);
    process.exit(3);
  }
  for (const f of findings) console.log(`${f.seq ?? "-"}\t${f.code}\t${f.detail}`);
  const hard = findings.filter((f) => f.code !== "UNCHECKED_FIELDS");
  console.log(hard.length ? `FAIL: ${hard.length} finding(s) over ${chain.length} record(s)` : `OK: ${chain.length} record(s)`);
  process.exit(hard.length ? 1 : 0);
}
