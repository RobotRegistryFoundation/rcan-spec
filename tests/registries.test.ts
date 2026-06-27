/**
 * rcan-spec — Vitest tests for the RCN / RMN / RHN sibling registries
 * (_registry-core.ts). Pure helpers + a full mint → resolve → dedupe → list →
 * 404 → auth roundtrip against a small in-memory D1 mock.
 */
import { describe, it, expect } from "vitest";
import {
  formatRegistryId, slugify, buildUri, idPattern,
  handleRegister, handleGet, handleList, handleUpdate, handleDelete, makeOnRequest,
  COMPONENTS, MODELS, HARNESSES,
  type Env, type RegistryConfig,
} from "../functions/api/v1/_registry-core.js";

// ── in-memory D1 mock (interprets exactly the shapes the core emits) ──────────
function makeDB() {
  const store: Record<string, any[]> = {};
  let autoId = 0;
  const tableOf = (sql: string) => (sql.match(/(?:INTO|FROM|UPDATE)\s+(\w+)/i)?.[1] ?? "");
  return {
    _store: store,
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          const t = tableOf(sql);
          // honor the SELECT column projection (so private cols like contact_email
          // / api_key_hash don't leak into a card, exactly like real D1).
          const selMatch = sql.match(/^\s*SELECT\s+(.+?)\s+FROM/is);
          const selCols = selMatch && !/COUNT\(/i.test(selMatch[1])
            ? selMatch[1].split(",").map((s) => s.trim()).filter((c) => c !== "*")
            : null;
          const project = (row: any) => {
            if (!row || !selCols) return row;
            const out: any = {};
            for (const c of selCols) out[c] = row[c];
            return out;
          };
          return {
            async run() {
              store[t] = store[t] || [];
              if (/^\s*INSERT/i.test(sql)) {
                const cols = sql.match(/\(([^)]+)\)\s*VALUES/i)![1].split(",").map((s) => s.trim());
                const row: any = { id: ++autoId, deleted: 0 };
                cols.forEach((c, i) => { row[c] = args[i]; });
                store[t].push(row);
                return { success: true };
              }
              if (/SET\s+deleted\s*=\s*1/i.test(sql)) {
                const r = store[t].find((x) => x.id === args[args.length - 1]);
                if (r) { r.deleted = 1; r.updated_at = args[0]; }
                return { success: true };
              }
              const setCols = sql.match(/SET\s+(.+?)\s+WHERE/i)![1].split(",").map((s) => s.trim().split("=")[0].trim());
              const r = store[t].find((x) => x.id === args[args.length - 1]);
              if (r) setCols.forEach((c, i) => { r[c] = args[i]; });
              return { success: true };
            },
            async first() {
              const rows = (store[t] || []).filter((x) => !x.deleted);
              if (/COUNT\(\*\)/i.test(sql)) return { total: rows.length };
              if (/WHERE\s+uri\s*=\s*\?/i.test(sql)) {
                const f = [...(store[t] || [])].filter((x) => x.uri === args[0]).sort((a, b) => b.id - a.id)[0];
                return f ? project(f) : null;
              }
              const idm = sql.match(/WHERE\s+(r[cmh]n)\s*=\s*\?/i);
              if (idm) {
                const col = idm[1].toLowerCase();
                return project(rows.find((x) => String(x[col]).toUpperCase() === String(args[0]).toUpperCase()) ?? null);
              }
              const condCols = [...sql.matchAll(/(\w+)\s*=\s*\?/g)].map((m) => m[1]);
              return project(rows.find((x) => condCols.every((c, i) => x[c] === args[i])) ?? null);
            },
            async all() {
              return { results: (store[t] || []).filter((x) => !x.deleted).sort((a, b) => b.id - a.id).map(project) };
            },
          };
        },
      };
    },
  };
}
const env = (db: any): Env => ({ DB: db as unknown as D1Database });
const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ── pure helpers ──────────────────────────────────────────────────────────────
describe("registry pure helpers", () => {
  it("formatRegistryId zero-pads to 12 digits, mirroring RRN", () => {
    expect(formatRegistryId("RCN", 42)).toBe("RCN-000000000042");
    expect(formatRegistryId("RMN", 7)).toBe("RMN-000000000007");
    expect(formatRegistryId("RHN", 123456789012)).toBe("RHN-123456789012");
  });
  it("slugify lowercases, collapses non [a-z0-9-], trims hyphens", () => {
    expect(slugify("Claude Opus 4.7")).toBe("claude-opus-4-7");
    expect(slugify("OpenCastor@2026.3")).toBe("opencastor-2026-3");
    expect(slugify("--STS3215--")).toBe("sts3215");
  });
  it("buildUri places the kind letter + slugged identity in order", () => {
    expect(buildUri(MODELS, ["Anthropic", "claude-opus-4-7", "4-7"])).toBe("rcan://rcan.dev/m/anthropic/claude-opus-4-7/4-7");
    expect(buildUri(COMPONENTS, ["Feetech", "STS3215", "SN-1"])).toBe("rcan://rcan.dev/c/feetech/sts3215/sn-1");
  });
  it("idPattern accepts root + delegated ids, rejects the wrong prefix", () => {
    expect(idPattern(COMPONENTS).test("RCN-000000000042")).toBe(true);
    expect(idPattern(COMPONENTS).test("RCN-AB-000000000042")).toBe(true);
    expect(idPattern(COMPONENTS).test("RMN-000000000042")).toBe(false);
    expect(idPattern(MODELS).test("RMN-000000000007")).toBe(true);
  });
});

// ── mint → resolve → dedupe → list ────────────────────────────────────────────
describe("component (RCN) registry roundtrip", () => {
  it("registers, mints a padded RCN, resolves it, dedupes a repeat, and lists it", async () => {
    const db = makeDB();
    const reg = await handleRegister(post("https://rcan.dev/api/v1/components", {
      manufacturer: "Feetech", model: "STS3215", serial: "SN-0001", category: "servo", firmware_hash: "sha256:abc",
    }), env(db), COMPONENTS);
    expect(reg.status).toBe(201);
    const created = await reg.json() as any;
    expect(created.rcn).toBe("RCN-000000000001");
    expect(created.uri).toBe("rcan://rcan.dev/c/feetech/sts3215/sn-0001");
    expect(created.api_key).toMatch(/^rcan_/);            // key shown once
    expect("api_key_hash" in created).toBe(false);        // hash never leaves the server

    const got = await handleGet("RCN-000000000001", env(db), COMPONENTS);
    expect(got.status).toBe(200);
    const card = await got.json() as any;
    expect(card.category).toBe("servo");
    expect("api_key" in card).toBe(false);                // resolve never returns secrets
    expect("contact_email" in card).toBe(false);          // private meta excluded from the card

    // same identity → dedupe to the same id, no second mint
    const again = await handleRegister(post("https://rcan.dev/api/v1/components", {
      manufacturer: "feetech", model: "sts3215", serial: "sn-0001",
    }), env(db), COMPONENTS);
    expect(again.status).toBe(200);
    expect((await again.json() as any).already_existed).toBe(true);

    const list = await handleList(new Request("https://rcan.dev/api/v1/components"), env(db), COMPONENTS);
    expect((await list.json() as any).total).toBe(1);
  });

  it("missing required identity → 400 (and never touches the DB)", async () => {
    const thrower = { prepare() { throw new Error("DB must not be hit before validation"); } };
    const res = await handleRegister(post("https://rcan.dev/api/v1/components", { manufacturer: "x" }), env(thrower), COMPONENTS);
    expect(res.status).toBe(400);
  });

  it("unknown id → honest 404 (never fabricates a record)", async () => {
    const res = await handleGet("RCN-000000000999", env(makeDB()), COMPONENTS);
    expect(res.status).toBe(404);
  });
});

// ── model + harness identity shapes ───────────────────────────────────────────
describe("model (RMN) + harness (RHN) registries mint with their own identity", () => {
  it("RMN identity = provider+model+version", async () => {
    const db = makeDB();
    const res = await handleRegister(post("https://rcan.dev/api/v1/models", {
      provider: "Anthropic", model: "claude-opus-4-7", version: "4-7", modality: "llm",
    }), env(db), MODELS);
    const j = await res.json() as any;
    expect(j.rmn).toBe("RMN-000000000001");
    expect(j.uri).toBe("rcan://rcan.dev/m/anthropic/claude-opus-4-7/4-7");
  });
  it("RHN identity = name+version", async () => {
    const db = makeDB();
    const res = await handleRegister(post("https://rcan.dev/api/v1/harnesses", {
      name: "OpenCastor", version: "2026.3", repo: "github.com/opencastor/opencastor",
    }), env(db), HARNESSES);
    const j = await res.json() as any;
    expect(j.rhn).toBe("RHN-000000000001");
    expect(j.uri).toBe("rcan://rcan.dev/h/opencastor/2026-3");
  });
});

// ── auth on mutations ─────────────────────────────────────────────────────────
describe("mutations require the registrant api key", () => {
  it("update/delete: no token → 401; correct key → 200", async () => {
    const db = makeDB();
    const reg = await handleRegister(post("https://rcan.dev/api/v1/harnesses", { name: "h", version: "1" }), env(db), HARNESSES);
    const key = (await reg.json() as any).api_key as string;

    const noauth = await handleUpdate("RHN-000000000001",
      new Request("https://rcan.dev/api/v1/harnesses/RHN-000000000001", { method: "PATCH", body: "{}" }), env(db), HARNESSES);
    expect(noauth.status).toBe(401);

    const ok = await handleUpdate("RHN-000000000001",
      new Request("https://rcan.dev/api/v1/harnesses/RHN-000000000001", {
        method: "PATCH", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ description: "the runtime" }),
      }), env(db), HARNESSES);
    expect(ok.status).toBe(200);
    expect((await ok.json() as any).description).toBe("the runtime");

    const del = await handleDelete("RHN-000000000001",
      new Request("https://rcan.dev/api/v1/harnesses/RHN-000000000001", {
        method: "DELETE", headers: { Authorization: `Bearer ${key}` },
      }), env(db), HARNESSES);
    expect(del.status).toBe(200);
    // soft-deleted → resolve now 404
    expect((await handleGet("RHN-000000000001", env(db), HARNESSES)).status).toBe(404);
  });
});

// ── routing factory ───────────────────────────────────────────────────────────
describe("makeOnRequest routes collection vs item by the last path segment", () => {
  const onRequest = makeOnRequest(COMPONENTS);
  it("GET item id → resolve (404 for unknown); OPTIONS → 204 CORS", async () => {
    const item = await onRequest({ request: new Request("https://rcan.dev/api/v1/components/RCN-000000000999"), env: env(makeDB()) });
    expect(item.status).toBe(404);
    const pre = await onRequest({ request: new Request("https://rcan.dev/api/v1/components", { method: "OPTIONS" }), env: env(makeDB()) });
    expect(pre.status).toBe(204);
  });
  it("GET collection → list (200)", async () => {
    const res = await onRequest({ request: new Request("https://rcan.dev/api/v1/components"), env: env(makeDB()) });
    expect(res.status).toBe(200);
  });
});
